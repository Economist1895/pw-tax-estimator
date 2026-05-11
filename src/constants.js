// Singapore IRAS tax policy values for resident individuals (YA2024+).
// Source: https://www.iras.gov.sg/

// Resident individual income tax brackets.
// `base` is the cumulative tax at the start of each bracket.
export const TAX_BRACKETS = [
    { from: 0,       to: 20000,    rate: 0.000, base: 0      },
    { from: 20000,   to: 30000,    rate: 0.020, base: 0      },
    { from: 30000,   to: 40000,    rate: 0.035, base: 200    },
    { from: 40000,   to: 80000,    rate: 0.070, base: 550    },
    { from: 80000,   to: 120000,   rate: 0.115, base: 3350   },
    { from: 120000,  to: 160000,   rate: 0.150, base: 7950   },
    { from: 160000,  to: 200000,   rate: 0.180, base: 13950  },
    { from: 200000,  to: 240000,   rate: 0.190, base: 21150  },
    { from: 240000,  to: 280000,   rate: 0.195, base: 28750  },
    { from: 280000,  to: 320000,   rate: 0.200, base: 36550  },
    { from: 320000,  to: 500000,   rate: 0.220, base: 44550  },
    { from: 500000,  to: 1000000,  rate: 0.230, base: 84150  },
    { from: 1000000, to: Infinity, rate: 0.240, base: 199150 }
];

// Personal relief cap (combined cap across all reliefs)
export const RELIEF_CAP = 80000;

// Donation deduction multiplier for approved IPC donations
export const DONATION_MULTIPLIER = 2.5;

// Delivery / PHC fixed-expense deduction ratio (FEDR)
export const FEDR_INCOME_CAP = 50000;
export const PHC_FEDR_RATE = 0.60;

// Delivery modes — `rate` is the FEDR deemed-expense % when prescribed
export const DELIVERY_MODES = [
    { id: 'foot',  rate: 0.20, prescribed: true  },
    { id: 'pmd',   rate: 0.35, prescribed: true  },
    { id: 'van',   rate: 0.60, prescribed: true  },
    { id: 'other', rate: 0,    prescribed: false }
];

// Earned Income Relief caps by age bracket and disability status
export const EIR_CAPS = {
    'under55': { normal: 1000,  disabled: 4000  },
    '55to59':  { normal: 6000,  disabled: 10000 },
    '60plus':  { normal: 8000,  disabled: 12000 }
};

// CPF / Provident Fund Relief
export const CPF_CAP = 37740;
export const LIFE_INS_BUFFER = 5000;
export const LIFE_INS_CAP = 5000;

// CPF Cash Top-up Relief
export const TOPUP_CAP_SELF = 8000;
export const TOPUP_CAP_FAMILY = 8000;

// Supplementary Retirement Scheme caps (annual contribution)
export const SRS_CAP_LOCAL = 15300;
export const SRS_CAP_FOREIGN = 35700;

// Spouse / GCR / NSman relief amounts
export const SPOUSE_RELIEF_NORMAL = 2000;
export const SPOUSE_RELIEF_DISABILITY = 5500;
export const GCR_AMOUNT = 3000;
export const NSMAN_PARENT_OR_WIFE = 750;
export const NSMAN_SELF = {
    none: 0,
    noactivity: 1500,
    activity_nonkah: 3000,
    kah_noactivity: 3500,
    kah_activity: 5000
};

// Qualifying Child Relief / Child Relief (Disability)
export const QCR_AMOUNT = 4000;
export const CHILD_DISABILITY_AMOUNT = 7500;
export const CHILD_RELIEF_CAP_PER_CHILD = 50000;

// WMCR — fixed amounts for children born from 1 Jan 2024 onwards
export const WMCR_FIXED = { 1: 8000, 2: 10000, 3: 12000 };
// WMCR — % of earned income for children born before 2024
export const WMCR_PCT = { 1: 0.15, 2: 0.20, 3: 0.25 };

// Parent Relief / Parent Relief (Disability)
export const PARENT_RELIEF = {
    stays:              9000,
    separate:           5500,
    disabilityStays:    14000,
    disabilitySeparate: 10000
};
export const MAX_PARENT_DEPENDANTS = 2;

// Sibling Disability Relief
export const SIBLING_DISABILITY_AMOUNT = 5500;

// Annualisation
export const MAX_DAYS_PER_WEEK = 7;
export const WEEKS_PER_YEAR = 52;

// GIRO instalment plan
export const GIRO_MIN_MONTHLY = 20;
export const GIRO_MAX_MONTHS = 12;
