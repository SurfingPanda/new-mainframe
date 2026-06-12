// Cascading work-order categories: Category → Subcategory → Sub-subcategory.
// Each level's options are unique to its parent. Shared by the create form and
// the work-order detail view so the taxonomy lives in one place.
export const CATEGORY_TREE = {
  'Hardware': {
    'Desktops & Laptops': ['Won’t power on', 'Performance / slowness', 'Screen / display'],
    'Peripherals & Accessories': ['Keyboard / mouse', 'Docking station', 'External monitor']
  },
  'Software': {
    'Applications': ['Installation / update', 'Crashes / errors', 'Licensing / activation'],
    'Operating System': ['Updates / patching', 'Boot / startup', 'Configuration']
  },
  'Network & Connectivity': {
    'Wired / LAN': ['No connection', 'Slow speed', 'Cabling / port'],
    'Wireless / Wi-Fi': ['Cannot connect', 'Weak signal', 'Authentication']
  },
  'Account & Access': {
    'Login & Authentication': ['Password reset', 'Account locked', 'MFA / 2FA'],
    'Permissions & Roles': ['Access request', 'Role change', 'Shared drive / folder']
  },
  'Email & Communication': {
    'Email': ['Cannot send / receive', 'Spam / phishing', 'Mailbox full'],
    'Collaboration Tools': ['Chat / Teams', 'Video conferencing', 'Calendar']
  },
  'Security': {
    'Threats & Incidents': ['Malware / virus', 'Phishing report', 'Suspected breach'],
    'Policy & Compliance': ['Access review', 'Encryption', 'Audit request']
  },
  'Printing & Peripherals': {
    'Printers': ['Not printing', 'Paper jam', 'Toner / ink'],
    'Scanners & Copiers': ['Scan to email', 'Hardware fault', 'Driver issue']
  },
  'HR Concerns': {
    'Leave & Attendance': [
      'Overtime and Accomplishment Report Form',
      'Application for Vacation/Sick/Undertime Leave',
      'Request for Manpower Personnel',
      'Change Time Schedule / Cancel Restday / Change Restday'
    ],
    'Employee Records': ['Personal info update', 'Document request', 'Payroll query']
  },
  'Other': {
    'General Request': ['Information', 'Feedback', 'Other'],
    'Needs Triage': ['Uncategorized', 'Follow-up', 'Other']
  }
};

// Subcategory keys for a main category.
export function subcategoriesOf(category) {
  return category ? Object.keys(CATEGORY_TREE[category] || {}) : [];
}

// Sub-subcategory options for a category + subcategory pair.
export function subSubcategoriesOf(category, subcategory) {
  return category && subcategory ? (CATEGORY_TREE[category]?.[subcategory] || []) : [];
}
