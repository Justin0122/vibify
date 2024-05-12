export const MAX = 50;
export const MAX_RECOMMENDATIONS = 50;

export function checkAmount(amount) {
    return amount > MAX ? MAX : amount;
}