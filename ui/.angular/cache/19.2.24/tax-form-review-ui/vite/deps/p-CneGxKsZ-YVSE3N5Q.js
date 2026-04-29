import {
  f,
  m
} from "./chunk-SXMKPESC.js";
import {
  e
} from "./chunk-LVJXU2YI.js";
import {
  P,
  W
} from "./chunk-2JNVJW5X.js";
import {
  __async
} from "./chunk-WDMUDEB6.js";

// node_modules/@ionic/core/components/p-CneGxKsZ.js
var n = () => {
  const n2 = window;
  n2.addEventListener("statusTap", () => {
    W(() => {
      const o = document.elementFromPoint(n2.innerWidth / 2, n2.innerHeight / 2);
      if (!o) return;
      const e2 = f(o);
      e2 && new Promise((o2) => e(e2, o2)).then(() => {
        P(() => __async(null, null, function* () {
          e2.style.setProperty("--overflow", "hidden"), yield m(e2, 300), e2.style.removeProperty("--overflow");
        }));
      });
    });
  });
};
export {
  n as startStatusTap
};
/*! Bundled license information:

@ionic/core/components/p-CneGxKsZ.js:
  (*!
   * (C) Ionic http://ionicframework.com - MIT License
   *)
*/
//# sourceMappingURL=p-CneGxKsZ-YVSE3N5Q.js.map
