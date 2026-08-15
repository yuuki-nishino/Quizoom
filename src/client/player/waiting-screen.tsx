export interface WaitingScreenProps {
  readonly nickname: string;
}

/** 開始待ち表示: 自分のニックネームと開始待ちである旨を表示する（要件7.1） */
export function WaitingScreen({ nickname }: WaitingScreenProps) {
  return (
    <section aria-label="開始待ち">
      <p>
        ニックネーム: <strong>{nickname}</strong>
      </p>
      <p>開始をお待ちください</p>
    </section>
  );
}
