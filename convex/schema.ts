import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  events: defineTable({
    at: v.number(),        // ms since epoch, set on the server
    event: v.string(),     // view | follow | unlock | watch
    detail: v.string(),    // film title, or which button was tapped
    session: v.string(),   // random, dies with the browser tab
    device: v.string(),    // phone | tablet | desktop
    surface: v.string(),   // instagram | facebook | in-app | browser
    source: v.string(),    // referrer host, or ?src=
  }).index("by_at", ["at"]),
});
