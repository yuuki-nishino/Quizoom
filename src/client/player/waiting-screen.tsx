export interface WaitingScreenProps {
  readonly nickname: string;
}

/** 開始待ち表示: 自分のニックネームと開始待ちである旨を表示する（要件7.1） */
export function WaitingScreen({ nickname }: WaitingScreenProps) {
  return (
    <section aria-label="開始待ち" className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-lg text-brand-text/80">
        ニックネーム: <strong className="text-brand-primary">{nickname}</strong>
      </p>
      <p className="text-2xl font-bold">開始をお待ちください</p>
    </section>
  );
}
