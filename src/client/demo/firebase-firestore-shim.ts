export class Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;

  constructor(seconds: number, nanoseconds = 0) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  static now() {
    return Timestamp.fromMillis(Date.now());
  }

  static fromDate(date: Date) {
    return Timestamp.fromMillis(date.getTime());
  }

  static fromMillis(milliseconds: number) {
    const seconds = Math.floor(milliseconds / 1000);
    return new Timestamp(seconds, Math.round((milliseconds - seconds * 1000) * 1e6));
  }

  toMillis() {
    return this.seconds * 1000 + this.nanoseconds / 1e6;
  }

  toDate() {
    return new Date(this.toMillis());
  }
}

export function serverTimestamp() {
  return Date.now();
}
