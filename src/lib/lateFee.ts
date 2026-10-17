/** The default late fee for a rent: 5%, rounded to the cent, in dollars. Shared by the server and the lease form. */
export const defaultLateFee = (rent: number) => Math.round(Math.round(rent * 100) * 0.05) / 100;
