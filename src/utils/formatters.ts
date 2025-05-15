export const formatCurrency = (value: string | number | null): string => {
    if (value === null || value === '') return '$0.00';
    const numericValue = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(numericValue);
}; 