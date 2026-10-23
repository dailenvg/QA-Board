/**
 * Compile-time contract check (no runtime code). Fails `pnpm typecheck` when
 * the server's mirrored wire types, its zod schemas, and the types published
 * by `@pinpoint/widget` stop being mutually assignable.
 */
import type * as Widget from "@pinpoint/widget";
import type { z } from "zod";
import type { createPinInputSchema, pinSchema, updatePinRequestSchema } from "../src/schemas";
import type * as Server from "../src/types";

type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type Contract = [
  Assert<MutuallyAssignable<Server.Pin, Widget.Pin>>,
  Assert<MutuallyAssignable<Server.Reply, Widget.Reply>>,
  Assert<MutuallyAssignable<Server.PinAnchor, Widget.PinAnchor>>,
  Assert<MutuallyAssignable<Server.PinContext, Widget.PinContext>>,
  Assert<MutuallyAssignable<Server.Priority, Widget.Priority>>,
  Assert<MutuallyAssignable<Server.ListPinsQuery, Widget.ListPinsQuery>>,
  Assert<MutuallyAssignable<Server.CreatePinInput, Widget.CreatePinInput>>,
  Assert<MutuallyAssignable<Server.AddReplyInput, Widget.AddReplyInput>>,
  Assert<MutuallyAssignable<Server.ResolvePinInput, Widget.ResolvePinInput>>,
  Assert<MutuallyAssignable<Server.UpdatePinRequest, Widget.UpdatePinRequest>>,
  Assert<MutuallyAssignable<Server.ListPinsResponse, Widget.ListPinsResponse>>,
  Assert<MutuallyAssignable<Server.PinResponse, Widget.PinResponse>>,
  Assert<MutuallyAssignable<Server.ErrorResponse, Widget.ErrorResponse>>,
  Assert<
    MutuallyAssignable<typeof Server.MAX_SCREENSHOT_BYTES, typeof Widget.MAX_SCREENSHOT_BYTES>
  >,
  Assert<MutuallyAssignable<typeof Server.MAX_BODY_LENGTH, typeof Widget.MAX_BODY_LENGTH>>,
  Assert<MutuallyAssignable<typeof Server.MAX_NAME_LENGTH, typeof Widget.MAX_NAME_LENGTH>>,
  Assert<MutuallyAssignable<typeof Server.TOKEN_HEADER, typeof Widget.TOKEN_HEADER>>,
  Assert<MutuallyAssignable<typeof Server.PRIORITIES, typeof Widget.PRIORITIES>>,
  Assert<MutuallyAssignable<z.output<typeof createPinInputSchema>, Server.CreatePinInput>>,
  Assert<MutuallyAssignable<z.output<typeof updatePinRequestSchema>, Server.UpdatePinRequest>>,
  Assert<MutuallyAssignable<z.output<typeof pinSchema>, Server.Pin>>,
];
