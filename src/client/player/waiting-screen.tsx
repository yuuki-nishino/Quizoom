export interface WaitingScreenProps {
  readonly nickname: string;
}

/** 開始待ち表示: 自分のニックネームと開始待ちである旨を表示する（要件7.1） */
export function WaitingScreen({ nickname }: WaitingScreenProps) {
  return (
    <section aria-label="開始待ち" className="quiz-phase-enter flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-lg text-brand-text/80">
        ニックネーム: <strong className="text-brand-primary">{nickname}</strong>
      </p>
      <p className="text-2xl font-bold tracking-tight">開始をお待ちください</p>
      <span aria-hidden="true" className="mt-2 h-2.5 w-2.5 rounded-full bg-brand-accent motion-safe:animate-pulse" />
    </section>
  );
}
