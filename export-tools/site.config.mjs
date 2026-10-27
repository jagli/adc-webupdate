/**
 * Site description — the one place the development tools learn what this
 * site is made of.
 *
 * Dev-only. The published site never reads this file, and nothing in
 * export-tools/ is ever uploaded. To use the tools on another static site of
 * this kind, describe that site here; the tools themselves hold no page
 * names, file names or selectors.
 */
export const site = {
  /** Pages visitors can reach. These, and only these, are published. */
  pages: [
    "index", "about", "performances", "school", "activities", "store",
    "support", "contact", "research", "testimonials", "credentials", "gallery",
    "404",
  ],

  /** Folders published as they are, for hidden features reached only by their link (#ram); no page links to them. */
  hiddenFolders: ["ram"],

  /** Files at the top of the site for search engines, published as they are (the live address only;
   *  the test site gets a robots.txt that keeps it out of search results, and no sitemap). */
  searchFiles: ["robots.txt", "sitemap.xml", "_redirects"],

  /** Pages for development only: checked by the tools, never published. */
  devPages: ["foundry"],

  /** Dev pages kept in the house formatting (a prototype under review is left alone). */
  formattedDevPages: ["foundry"],

  /** Published stylesheets, in cascade order. */
  styles: ["tokens", "chrome", "main", "luxury", "sections"],

  /** The stylesheets each page links directly; the others arrive through @import. */
  linkedStyles: ["main", "luxury", "sections"],

  /** Stylesheets used only by the dev pages. */
  devStyles: ["foundry-chrome"],

  /** Published scripts. */
  scripts: [
    "icons", "adc-images", "progressive-images", "chrome",
    "interactions", "main", "gallery", "instagram-data", "instagram",
    "productions-data", "productions", "press", "photo-picker",
  ],

  /** Scripts used only by the dev pages. */
  devScripts: ["foundry"],

  /** Files at the top of the repo that look like pages but are not part of the site. */
  notSite: ["Abhinava-Website-Review-Feedback.html"],

  /** Screen widths the proof checks, in CSS pixels. */
  widths: [320, 375, 768, 1024, 1200, 1440],
  quickWidths: [375, 1440],
  viewportHeight: 900,

  /**
   * Parts of a page that must never change during design work.
   * `proof --locked` fails if any of these differs from the reference copy.
   */
  lockedRegions: [
    ".site-header", ".mobile-nav", ".mobile-nav__backdrop", ".site-footer", "#skip-link",
    ".v-hero", ".v-chapter__nav",
    ".alt-band:has(.alt-pillars)", ".alt-partners",
  ],

  /** Notes for the unused-CSS finder. */
  unusedCss: {
    /** Stylesheets it examines (tokens are kept whether used or not). */
    styles: ["chrome", "main", "luxury", "sections"],
    /** Words that appear in scripts for other reasons, so look used when they are not. */
    notReallyUsed: ["section", "subnav", "container"],
    /** Classes with no reference in the source that must stay: the site build adds the first two;
     *  the others are shared variants kept for the next use (struck-through pending text, navy text panel). */
    alwaysKeep: ["img-progressive", "img-progressive--loaded", "is-pending", "s-section__content--navy", "s-mini--video"],
  },

  /** The Design Foundry: the dev page that shows each component next to its rules. */
  foundry: {
    page: "foundry",
    style: "foundry-chrome",
    /** Every class this stylesheet styles must start with this; anything else is a forked component. */
    classPrefix: "foundry",
    /** The only rules it may hold that do not end on a Foundry class, each written out in full. */
    allowedSelectors: ['body[data-page="foundry"] .site-main', ".foundry__note code"],
  },

  /**
   * Outside services a published page is allowed to load from. The package
   * check lists what it actually finds and fails on anything not named here.
   */
  outsideServices: ["fonts.googleapis.com", "fonts.gstatic.com", "img.youtube.com", "www.youtube.com"],
};

/** "index" → "index.html" */
export const pageFile = (name) => `${name}.html`;
export const styleFile = (name) => `css/${name}.css`;
export const scriptFile = (name) => `js/${name}.js`;
