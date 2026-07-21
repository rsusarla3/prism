export type GrowthPoint={year:number;linear:number;exponential:number};
export type GrowthResult={points:GrowthPoint[];crossoverYear:number|null;prediction:{actual:'linear'|'exponential';guess:'linear'|'exponential';correct:boolean}};
export type InvestPoint={year:number;balance:number;contributed:number;inflationAdjusted:number};
export type Projection={balance:number;contributed:number;growth:number;feeDrag:number;inflationAdjustedBalance:number;estimatedMonthlyIncome:number;series:InvestPoint[]};
export type InvestResult={projection:Projection;comparisons:{baseline:Projection;startLater:Projection;higherFee:Projection}};
export type FutureGoal={id:string;label:string;category:string};
export type Asset={id:string;title:string;description:string};
export type Content={assetClasses:Asset[];futureGoals:FutureGoal[];suggestedKeywords:string[]};
