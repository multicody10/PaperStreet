import type { SymbolCode } from '../shared/stocks';

export type StockProfile = { sector: string; summary: string; peers: readonly SymbolCode[] };
export const STOCK_PROFILES: Record<SymbolCode, StockProfile> = {
  AAPL: { sector: 'Consumer technology', summary: 'Apple designs consumer electronics, personal computing devices, software, and services, including iPhone, Mac, iPad, and its digital services ecosystem.', peers: ['MSFT','GOOGL','AMZN','META'] },
  MSFT: { sector: 'Software & cloud', summary: 'Microsoft develops software, enterprise services, cloud infrastructure, productivity applications, and gaming products.', peers: ['GOOGL','AMZN','AAPL','NVDA'] },
  NVDA: { sector: 'Semiconductors & AI computing', summary: 'NVIDIA designs graphics processors, accelerated computing hardware, and software platforms used for artificial intelligence, data centers, gaming, and visualization.', peers: ['AMD','INTC','MSFT'] },
  AMZN: { sector: 'E-commerce & cloud', summary: 'Amazon operates online retail and fulfillment services, cloud computing through AWS, and advertising and digital entertainment businesses.', peers: ['MSFT','GOOGL','AAPL','NFLX'] },
  GOOGL: { sector: 'Internet services & cloud', summary: 'Alphabet operates Google Search, YouTube, Android, advertising platforms, and Google Cloud, with additional technology research businesses.', peers: ['META','MSFT','AMZN','AAPL'] },
  META: { sector: 'Social platforms & advertising', summary: 'Meta operates Facebook, Instagram, WhatsApp, and digital advertising platforms, and develops augmented and virtual reality technologies.', peers: ['GOOGL','AAPL','MSFT'] },
  TSLA: { sector: 'Electric vehicles & energy', summary: 'Tesla develops electric vehicles, battery systems, energy storage products, charging infrastructure, and related software.', peers: ['AAPL','AMZN','SPY'] },
  AMD: { sector: 'Semiconductors', summary: 'AMD designs processors, graphics chips, and accelerated computing hardware for personal computers, gaming, and data centers.', peers: ['NVDA','INTC','MSFT'] },
  NFLX: { sector: 'Streaming & entertainment', summary: 'Netflix operates a subscription video entertainment service and produces and licenses films, series, and other programming.', peers: ['DIS','AMZN'] },
  DIS: { sector: 'Media & entertainment', summary: 'The Walt Disney Company operates entertainment studios, streaming services, television networks, and theme parks and experiences.', peers: ['NFLX','AMZN'] },
  INTC: { sector: 'Semiconductors', summary: 'Intel develops and manufactures processors, computing technologies, and semiconductor products for client, data center, and other markets.', peers: ['AMD','NVDA','MSFT'] },
  SPY: { sector: 'S&P 500 index ETF', summary: 'SPDR S&P 500 ETF Trust is an exchange traded fund designed to track the performance of the S&P 500 Index before fees and expenses.', peers: ['AAPL','MSFT','NVDA','AMZN'] },
};
