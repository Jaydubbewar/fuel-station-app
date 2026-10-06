import { calculateTransaction } from '../../utils/calculations';

describe('bill calculation utility', () => {
  it('matches the Excel convention example', () => {
    const result = calculateTransaction({
      quantity: 3000,
      rate: 99.89,
      discountPerLiter: 0.85,
      tdsRate: 0.001,
      creditAmount: 0,
      previousBalance: 0
    });

    expect(result.grossAmount).toBe(299670);
    expect(result.discountAmount).toBe(2550);
    expect(result.netAmount).toBe(297120);
    expect(result.tdsAmount).toBe(297.12);
    expect(result.afterTdsAmount).toBe(296822.88);
  });

  it('handles zero discount and zero TDS', () => {
    const result = calculateTransaction({
      quantity: 10,
      rate: 25.5,
      discountPerLiter: 0,
      tdsRate: 0,
      creditAmount: 0,
      previousBalance: 0
    });

    expect(result.grossAmount).toBe(255);
    expect(result.discountAmount).toBe(0);
    expect(result.netAmount).toBe(255);
    expect(result.tdsAmount).toBe(0);
    expect(result.afterTdsAmount).toBe(255);
  });
});
