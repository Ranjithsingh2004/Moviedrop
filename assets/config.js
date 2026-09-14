/* ==========================================================================
   MovieDrop — where the stats backend lives.

   This is the Convex HTTP Actions base URL (the .convex.site one, not
   .convex.cloud). The site posts events to <base>/track and the dashboard
   reads <base>/stats. Blank it out and nothing is recorded, no requests are
   made, and the site behaves exactly as it did before.
   ========================================================================== */
window.MOVIEDROP_STATS_URL = 'https://outgoing-robin-116.convex.site';
