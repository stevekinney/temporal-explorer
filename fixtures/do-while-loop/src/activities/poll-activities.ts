export type PollInput = {
  jobId: string;
  maxAttempts: number;
};

export type PollStatus = {
  status: string;
  attempt: number;
};

export type PollResult = {
  jobId: string;
  attempts: number;
};

export async function pollStatus(_jobId: string, attempt: number): Promise<PollStatus> {
  return { status: attempt >= 2 ? 'ready' : 'pending', attempt };
}
