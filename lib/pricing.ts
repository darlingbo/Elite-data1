/**
 * Extra fee added on top of a bundle's price at checkout, as a fraction (0.02 = 2%).
 * It is 0: customers pay exactly the bundle price. Every screen and every server
 * check reads this one number, so they always agree on the amount.
 */
export const PLATFORM_FEE_RATE = 0;
