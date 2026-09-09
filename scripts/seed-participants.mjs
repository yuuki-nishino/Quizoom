#!/usr/bin/env node
// 検証用: 指定した参加コードに対して、複数の参加者を自動で参加登録し、
// 出題されるたびにランダムな選択肢で自動回答するスクリプト。
// 手動でニックネーム入力を何度も繰り返す手間を省くための開発用ツール（アプリ本体には含まれない）。
// ローカル検証だけでなく、baseUrlに本番のWorkers URLを渡せば本番環境での負荷試験にも使う
// （Issue #17。負荷試験の実施手順はtasks.mdのtask 27を参照）。
//
// 使い方:
//   node scripts/seed-participants.mjs <joinCode> <人数> [baseUrl] [--ramp=10,30,60,100]
//   npm run seed:participants -- <joinCode> <人数> [baseUrl] [--ramp=10,30,60,100]
//
// 例:
//   node scripts/seed-participants.mjs ABCD123456 30
//   node scripts/seed-participants.mjs ABCD123456 100 https://quizoom.example.workers.dev --ramp=10,30,60,100
//
// <joinCode> は 進行画面の「公開」タブに表示される参加用URL
// (http://localhost:5173/join/ABCD123456 の "ABCD123456" の部分) から取得する。
//
// --ramp=10,30,60,100 を指定すると、指定した人数まで段階的に参加者を追加登録する。
// 各段階の完了時にエラー率(参加登録の失敗率)を表示し、5%を超えていれば試験を中断する。
// 次の段階へ進む前にEnterキー入力を待つため、その間にCloudflareダッシュボード
// (Workers & Durable Objects Analytics、D1 Analytics)でリクエスト数等を確認できる。
// 省略時は<人数>を一括で登録する(従来どおり)。
//
// 実行したままにしておくと、進行画面から「出題する」を押すたびに全参加者が
// 自動で回答する。Ctrl+C で終了すると、接続成功率・出題配信レイテンシ(p50/p95/最大)・
// エラー件数のサマリーを表示する。

import readline from "node:readline";

const args = process.argv.slice(2);
const rampArg = args.find((a) => a.startsWith("--ramp="));
const [joinCode, countArg, baseUrlArg] = args.filter((a) => !a.startsWith("--"));

if (!joinCode || !countArg) {
  console.error("使い方: node scripts/seed-participants.mjs <joinCode> <人数> [baseUrl=http://localhost:5173] [--ramp=10,30,60,100]");
  process.exit(1);
}

const count = Number(countArg);
if (!Number.isInteger(count) || count <= 0) {
  console.error(`人数は正の整数で指定してください（受け取った値: ${countArg}）`);
  process.exit(1);
}

const rampStages = rampArg
  ? rampArg
      .slice("--ramp=".length)
      .split(",")
      .map((s) => Number(s.trim()))
  : [count];

for (const stage of rampStages) {
  if (!Number.isInteger(stage) || stage <= 0) {
    console.error(`--ramp の各段階は正の整数で指定してください（受け取った値: ${rampArg}）`);
    process.exit(1);
  }
}
for (let i = 1; i < rampStages.length; i++) {
  if (rampStages[i] <= rampStages[i - 1]) {
    console.error("--ramp の各段階は昇順で指定してください（例: --ramp=10,30,60,100）");
    process.exit(1);
  }
}
if (rampStages[rampStages.length - 1] !== count) {
  console.error(`--ramp の最終段階は<人数>(${count})と一致させてください（受け取った値: ${rampStages.join(",")}）`);
  process.exit(1);
}

const baseUrl = baseUrlArg ?? "http://localhost:5173";
const wsBase = baseUrl.replace(/^http/, "ws");
const ERROR_RATE_THRESHOLD = 0.05;

const stats = {
  joinSuccess: 0,
  joinFailure: 0,
  connectErrorCount: 0,
  answerErrorCount: 0,
  questionLatenciesMs: [],
};

async function join(nickname) {
  const res = await fetch(`${baseUrl}/api/join/${joinCode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  if (!res.ok) {
    throw new Error(`参加登録に失敗しました (${nickname}): ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function connect(eventId, token, nickname) {
  const ws = new WebSocket(`${wsBase}/connect?eventId=${eventId}&role=participant&token=${token}`);

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "questionOpened") {
      // サーバーが出題を配信した時刻(serverNow)からクライアント受信までの経過時間を、
      // 配信レイテンシの近似値として記録する(端末間の時計ずれは含む)
      const latencyMs = Date.now() - message.payload.serverNow;
      stats.questionLatenciesMs.push(latencyMs);

      const options = message.payload.question.options;
      const choice = options[Math.floor(Math.random() * options.length)];
      // 実際の参加者と同様、ランダムな遅延(0〜2秒)を挟んでから回答する
      setTimeout(
        () => {
          try {
            ws.send(JSON.stringify({ type: "submitAnswer", questionId: message.payload.question.id, optionId: choice.id }));
            console.log(`  [${nickname}] 「${choice.label}」で回答しました（配信レイテンシ: ${latencyMs}ms）`);
          } catch (err) {
            stats.answerErrorCount++;
            console.error(`  [${nickname}] 回答送信に失敗しました: ${err.message}`);
          }
        },
        Math.floor(Math.random() * 2000),
      );
    }
  });

  ws.addEventListener("error", () => {
    stats.connectErrorCount++;
    console.error(`  [${nickname}] 接続エラー`);
  });

  return ws;
}

// readline.Interfaceは生成した瞬間からstdinの行を読み進めるため、rl.question()の
// 一回限りのlineリスナーを設置する前に行が届くと、リスナー不在のままその行が
// 破棄されてしまう(次のEnter待ちが永久に解決しなくなる)。非同期イテレータ経由で
// 読むと届いた行が内部でキューされるため、この取りこぼしが起きない
const stageReadline =
  rampStages.length > 1 ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
const stageLines = stageReadline ? stageReadline[Symbol.asyncIterator]() : null;

async function waitForEnter(message) {
  process.stdout.write(message);
  await stageLines.next();
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  return sortedValues[Math.min(sortedValues.length - 1, Math.floor((sortedValues.length - 1) * p))];
}

function printSummary() {
  const latencies = [...stats.questionLatenciesMs].sort((a, b) => a - b);
  const totalJoins = stats.joinSuccess + stats.joinFailure;
  const joinErrorRate = totalJoins === 0 ? 0 : stats.joinFailure / totalJoins;

  console.log("\n=== サマリー ===");
  console.log(`参加登録: 成功 ${stats.joinSuccess} / 失敗 ${stats.joinFailure}（エラー率 ${(joinErrorRate * 100).toFixed(1)}%）`);
  console.log(`接続エラー: ${stats.connectErrorCount}件`);
  console.log(`回答送信エラー: ${stats.answerErrorCount}件`);
  if (latencies.length > 0) {
    console.log(
      `出題配信レイテンシ: p50=${percentile(latencies, 0.5)}ms / p95=${percentile(latencies, 0.95)}ms / 最大=${latencies[latencies.length - 1]}ms（サンプル数 ${latencies.length}）`,
    );
  } else {
    console.log("出題配信レイテンシ: 計測データなし（出題が行われませんでした）");
  }
}

const sockets = [];
let registered = 0;
let aborted = false;

console.log(`合計${count}人の参加者を${rampStages.length > 1 ? `${rampStages.join("→")}人の段階で` : ""}登録します...`);

for (let stageIndex = 0; stageIndex < rampStages.length && !aborted; stageIndex++) {
  const target = rampStages[stageIndex];
  while (registered < target) {
    registered++;
    const nickname = `テスト参加者${registered}`;
    try {
      const { token, participantId, eventId } = await join(nickname);
      void participantId;
      stats.joinSuccess++;
      sockets.push(connect(eventId, token, nickname));
    } catch (err) {
      stats.joinFailure++;
      console.error(err.message);
    }
  }

  const totalJoins = stats.joinSuccess + stats.joinFailure;
  const errorRate = totalJoins === 0 ? 0 : stats.joinFailure / totalJoins;
  console.log(`--- 段階${stageIndex + 1}/${rampStages.length}: ${target}人まで登録完了（累積エラー率 ${(errorRate * 100).toFixed(1)}%） ---`);

  if (errorRate > ERROR_RATE_THRESHOLD) {
    console.error(`エラー率が閾値(${ERROR_RATE_THRESHOLD * 100}%)を超えました。これ以上のランプアップを中断します。`);
    aborted = true;
    break;
  }

  if (rampStages.length > 1 && stageIndex < rampStages.length - 1) {
    await waitForEnter("Cloudflareダッシュボードを確認したら Enter キーで次の段階へ進みます... ");
  }
}

stageReadline?.close();

console.log(`${sockets.length}/${count}人を登録しました。進行画面からいつもどおり操作してください。`);
console.log("設問が出題されると、このスクリプトが自動でランダム回答します。終了するには Ctrl+C を押してください。");

process.on("SIGINT", () => {
  console.log("\n接続を終了します...");
  sockets.forEach((ws) => ws.close());
  printSummary();
  process.exit(0);
});
