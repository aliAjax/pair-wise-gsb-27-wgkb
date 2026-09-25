/** 页面展示用格式化 */

export function yuan(value: number): string {
  return `¥${Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function tons(value: number): string {
  return `${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 3 })} 吨`;
}

export function kg(value: number): string {
  return `${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} kg`;
}

export function m3(value: number): string {
  return `${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} m³`;
}

/** 0.97 -> "降3%"，1 -> "原价" */
export function discountText(discount: number): string {
  if (discount >= 1) return "原价";
  return `降${Math.round((1 - discount) * 100)}%`;
}
