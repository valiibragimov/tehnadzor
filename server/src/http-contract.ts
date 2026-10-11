import { z } from "zod";

const moduleStatsSchema = z
  .object({
    total: z.number().int().min(0).max(100000),
    exceeded: z.number().int().min(0).max(100000)
  })
  .refine((value) => value.exceeded <= value.total, {
    message: "exceeded must be <= total"
  });

export const reportRequestSchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  construction: z.string().trim().min(1).max(64).optional(),
  summaryData: z.object({
    project: z.string().trim().max(256).optional(),
    construction: z.string().trim().max(64).optional(),
    date: z.string().trim().max(32).optional(),
    engineer: z.string().trim().max(128).optional(),
    geo: moduleStatsSchema,
    reinf: moduleStatsSchema,
    geom: moduleStatsSchema,
    strength: moduleStatsSchema
  })
});

export const ifcImportQuerySchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  sourceModelId: z.string().trim().min(1).max(80).optional(),
  fileName: z.string().trim().min(1).max(256).optional()
});

export const bimDeleteQuerySchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  sourceModelId: z.string().trim().min(1).max(80).optional()
});
