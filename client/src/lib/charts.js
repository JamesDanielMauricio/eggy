// The Revenue vs Expenses chart is the only thing that needs recharts, and
// recharts plus its dependencies is about half of the app's JavaScript. So
// the chart lives in its own chunk that's downloaded separately instead of
// being part of the startup bundle the phone has to fetch and parse first.
//
// `loadTrendChart()` is called as soon as the app starts (App.jsx), so the
// download runs in parallel with the login check and the data request — by
// the time the dashboard has data to draw, the chart code is usually there.

let loadedChart = null;
let pending = null;

export function loadTrendChart() {
  if (!pending) {
    pending = import('../components/TrendChart.jsx').then(
      (module) => (loadedChart = module.default),
      (error) => {
        // Forget the failure so a later attempt (the Retry button, or the
        // next app open) can try the download again.
        pending = null;
        throw error;
      },
    );
  }
  return pending;
}

// The chart component if its chunk has already arrived, otherwise null —
// lets the dashboard render it immediately, with no placeholder flash.
export function getLoadedTrendChart() {
  return loadedChart;
}
