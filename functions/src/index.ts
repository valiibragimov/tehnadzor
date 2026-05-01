import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { getProfileFeed } from "./services/profile-feed";

setGlobalOptions({
  region: "europe-west1",
  maxInstances: 5
});

export const profileFeed = onRequest(
  {
    cors: true,
    timeoutSeconds: 60,
    memory: "256MiB"
  },
  async (req: Request, res: Response) => {
    if (req.method !== "GET") {
      res.set("Allow", "GET");
      res.status(405).json({
        ok: false,
        error: "Method not allowed"
      });
      return;
    }

    try {
      const feed = await getProfileFeed();
      res.set("Cache-Control", "public, max-age=300, s-maxage=900");
      res.status(200).json({
        ok: true,
        ...feed
      });
    } catch (error) {
      console.error("[functions.profileFeed] error", error);
      res.status(500).json({
        ok: false,
        error: "Failed to load profile feed"
      });
    }
  }
);
