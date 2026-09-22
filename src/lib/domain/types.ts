/** A performance with confirmed start and end times. */
export interface ScheduledPerformance {
  id: string;
  artistId: string;
  artistName: string;
  stageId: string | null;
  stageName: string | null;
  startsAt: Date;
  endsAt: Date;
}

export interface Stage {
  id: string;
  name: string;
  sortOrder: number;
}
