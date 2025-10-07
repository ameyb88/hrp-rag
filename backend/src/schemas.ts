// import { z } from 'zod';

// export const AskRequest = z.object({
//   query: z.string().min(1),
//   topK: z.number().min(1).max(20).optional(),
// });

// export type AskRequest = z.infer<typeof AskRequest>;

export type Retrieved = {
  text: string;
  path: string;
  chunk_index: number;
};

export type ImageHit = {
  filename: string; // "create-action-plan.png"
  caption: string; // short
  score: number; // match score
};
