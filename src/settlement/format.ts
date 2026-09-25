// 页面展示用的格式化小工具。

import { PRICE_TIERS } from "./types";

export function formatTon(kg: number): string {
  return `${(kg / 1000).toLocaleString("zh-CN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  })} 吨`;
}

export function formatMoney(value: number): string {
  const text = Math.abs(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return value < 0 ? `-¥${text}` : `¥${text}`;
}

export function signedMoney(value: number): string {
  if (value === 0) return "¥0.00";
  const text = Math.abs(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${value < 0 ? "-" : "+"}¥${text}`;
}

export function tierLabel(tier: number): string {
  return PRICE_TIERS[tier]?.label ?? `第${tier + 1}档`;
}

export function discountText(discount: number): string {
  const percent = Math.round((1 - discount) * 100);
  return percent === 0 ? "原价" : `降${percent}%`;
}
