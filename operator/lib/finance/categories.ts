export const FINANCE_CATEGORIES = ['Unclassified', 'Shopping', 'Groceries', 'Eating Out', 'Medicine', 'Events', 'Transport', 'Subscriptions', 'Rent', 'Utilities', 'Fitness', 'Education', 'Personal Care', 'Gifts & Family', 'Transfers', 'Other'] as const;
export function merchantKey(value: string) { return value.trim().replace(/\s+/g, ' ').toLowerCase(); }
export function suggestCategory(merchant: string): string {
  const rules: Array<[RegExp, string]> = [
    [/\b(amazon|ekart|flipkart|myntra)\b/i, 'Shopping'],
    [/\b(blinkit|zepto|bigbasket|grocery|groceries|chicken)\b/i, 'Groceries'],
    [/\b(swiggy|zomato|restaurant|cafe|food court|sweets|snacks|chai)\b/i, 'Eating Out'],
    [/\b(pharmacy|medical|medicine|healthcare|hospital)\b/i, 'Medicine'],
    [/\b(bookmyshow|concert|cinema)\b/i, 'Events'],
    [/\b(uber|ola|rapido|fuel|fuels|petrol|filling station|irctc)\b/i, 'Transport'],
    [/\b(spotify|netflix|youtube premium)\b/i, 'Subscriptions'],
    [/\b(jio|airtel|electricity|broadband)\b/i, 'Utilities'],
    [/\b(gym|fitness)\b/i, 'Fitness'], [/\b(salon|barber)\b/i, 'Personal Care'],
  ];
  return rules.find(([pattern]) => pattern.test(merchant))?.[1] ?? 'Unclassified';
}
