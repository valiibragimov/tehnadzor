declare global {
namespace Express {
  interface Request {
    user?: {
      uid: string;
      email: string | null;
    };
  }
}

}
export {};
