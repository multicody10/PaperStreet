import type { SymbolCode } from '../shared/stocks';

export type StockProfile = { companyName:string; sector: string; summary: string; peers: readonly SymbolCode[] };
export const STOCK_PROFILES: Record<SymbolCode, StockProfile> = {
  AAPL: { companyName: 'Apple Inc.', sector: 'Consumer technology', summary: 'Apple designs consumer electronics, personal computing devices, software, and services, including iPhone, Mac, iPad, and its digital services ecosystem.', peers: ['MSFT','GOOGL','AMZN','META'] },
  MSFT: { companyName: 'Microsoft Corporation', sector: 'Software & cloud', summary: 'Microsoft develops software, enterprise services, cloud infrastructure, productivity applications, and gaming products.', peers: ['GOOGL','AMZN','AAPL','NVDA'] },
  NVDA: { companyName: 'NVIDIA Corporation', sector: 'Semiconductors & AI computing', summary: 'NVIDIA designs graphics processors, accelerated computing hardware, and software platforms used for artificial intelligence, data centers, gaming, and visualization.', peers: ['AMD','INTC','MSFT'] },
  AMZN: { companyName: 'Amazon.com, Inc.', sector: 'E-commerce & cloud', summary: 'Amazon operates online retail and fulfillment services, cloud computing through AWS, and advertising and digital entertainment businesses.', peers: ['MSFT','GOOGL','AAPL','NFLX'] },
  GOOGL: { companyName: 'Alphabet Inc.', sector: 'Internet services & cloud', summary: 'Alphabet operates Google Search, YouTube, Android, advertising platforms, and Google Cloud, with additional technology research businesses.', peers: ['META','MSFT','AMZN','AAPL'] },
  META: { companyName: 'Meta Platforms, Inc.', sector: 'Social platforms & advertising', summary: 'Meta operates Facebook, Instagram, WhatsApp, and digital advertising platforms, and develops augmented and virtual reality technologies.', peers: ['GOOGL','AAPL','MSFT'] },
  TSLA: { companyName: 'Tesla, Inc.', sector: 'Electric vehicles & energy', summary: 'Tesla develops electric vehicles, battery systems, energy storage products, charging infrastructure, and related software.', peers: ['AAPL','AMZN','SPY'] },
  AMD: { companyName: 'Advanced Micro Devices, Inc.', sector: 'Semiconductors', summary: 'AMD designs processors, graphics chips, and accelerated computing hardware for personal computers, gaming, and data centers.', peers: ['NVDA','INTC','MSFT'] },
  NFLX: { companyName: 'Netflix, Inc.', sector: 'Streaming & entertainment', summary: 'Netflix operates a subscription video entertainment service and produces and licenses films, series, and other programming.', peers: ['DIS','AMZN'] },
  DIS: { companyName: 'The Walt Disney Company', sector: 'Media & entertainment', summary: 'The Walt Disney Company operates entertainment studios, streaming services, television networks, and theme parks and experiences.', peers: ['NFLX','AMZN'] },
  INTC: { companyName: 'Intel Corporation', sector: 'Semiconductors', summary: 'Intel develops and manufactures processors, computing technologies, and semiconductor products for client, data center, and other markets.', peers: ['AMD','NVDA','MSFT'] },
  SPY: { companyName: 'SPDR S&P 500 ETF Trust', sector: 'S&P 500 index ETF', summary: 'SPDR S&P 500 ETF Trust is an exchange traded fund designed to track the performance of the S&P 500 Index before fees and expenses.', peers: ['AAPL','MSFT','NVDA','AMZN'] },
};
