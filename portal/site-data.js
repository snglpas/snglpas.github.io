// Single source of truth for the company's public contact details.
//
// These phone numbers are the only place the site's phone numbers are defined.
// Every header, footer and contacts-page link is rendered from this list by
// public.js (see syncPhones). To change a number, edit it here; to switch the
// numbers back on, set SHOW_PHONES to true.
export const SITE_PHONES = [
  {
    tel: "+70000000000",
    display: "+7 (000) 000-00-00",
  },
  {
    tel: "+70000000001",
    display: "+7 (000) 000-00-01",
  },
];

// While false, every phone number on the site stays hidden.
export const SHOW_PHONES = false;
