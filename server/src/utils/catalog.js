// Single place that defines plans and garment categories.
// To enable a new category: add it to SUPPORTED_CATEGORIES here AND register an adapter in sdk/src/adapters/index.js.
const PLANS = ['STARTER', 'BUSINESS', 'ENTERPRISE'];
const SUPPORTED_CATEGORIES = ['tshirt', 'shirt', 'pant', 'saree', 'dress', 'kurti', 'chudidar'];
const PLANNED_CATEGORIES = ['other'];
const CALIBRATION_RANGES = {
  widthRatio: [0.3, 3], heightRatio: [0.3, 3],
  anchorX: [0, 1], anchorY: [0, 1],
  offsetX: [-1, 1], offsetY: [-1, 1],
};
module.exports = { PLANS, SUPPORTED_CATEGORIES, PLANNED_CATEGORIES, CALIBRATION_RANGES };
