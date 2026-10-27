export type PeriodValue = {
  period: string;
  [key: string]: string | number;
};

export type OperationalData = {
  naturalGas: {
    production: Array<{ period: string; type: string; volume: number }>;
    exports: Array<{ period: string; volumeCubicMeters: number }>;
    transport: Array<{ period: string; packedVolume: number; injectedVolume: number }>;
    distribution: Array<{ period: string; concession: string; volume: number; customers: number }>;
    network: Array<{ period: string; concession: string; kilometers: number }>;
    tariffs: Array<{
      concession: string;
      period: string;
      categories: Array<{ category: string; range: string; rates: Array<{ label: string; value: number }> }>;
    }>;
  };
  liquidFuels: {
    fines: Array<{ period: string; count: number; uit: number }>;
    fuelPrices: Array<{ period: string; product: string; averagePrice: number }>;
    fuelSales: Array<{ period: string; product: string; gallons: number }>;
    glpPrices: Array<{ period: string; averagePrice: number }>;
    glpSales: Array<{ period: string; product: string; barrels: number }>;
    trade: Array<{ period: string; direction: string; product: string; volumeMbbl: number }>;
    priceStructure: Array<{ period: string; product: string; publicPrice: number }>;
  };
};
