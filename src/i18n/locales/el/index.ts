/**
 * One JSON file per namespace; the file name is the first key segment
 * (`nav.json` → `t("nav.home")`). Add new namespaces to every locale's index.
 */
import about from "./about.json";
import common from "./common.json";
import contact from "./contact.json";
import footer from "./footer.json";
import home from "./home.json";
import legal from "./legal.json";
import nav from "./nav.json";
import services from "./services.json";

export default { about, common, contact, footer, home, legal, nav, services };
