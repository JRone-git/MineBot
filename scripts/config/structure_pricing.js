// Structure placement pricing configuration
export default {
  allowOpsFreePlacement: true,
  minPrice: 50,
  ratePerBlock: 0.02, // coins per block of volume (dx*dy*dz)
  maxCap: 25000,
  refundOnUndo: "full" // "none" | "full" | { percent: 100 }
};
