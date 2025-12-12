export class WeightedAverage {
  private weightedSum = 0;
  private totalWeight = 0;

  constructor(initialValue = 0) {
    this.add(initialValue, 1);
  }

  add(value: number, weight: number) {
    this.weightedSum += value * weight;
    this.totalWeight += weight;
  }

  get average(): number {
    return this.totalWeight > 0 ? this.weightedSum / this.totalWeight : 0;
  }

  get hasData(): boolean {
    return this.totalWeight > 0;
  }

  reset() {
    this.weightedSum = 0;
    this.totalWeight = 0;
  }
}
