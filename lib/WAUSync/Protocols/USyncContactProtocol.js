import { assertNodeErrorFree } from "../../WABinary/index.js";
import { USyncUser } from "../USyncUser.js";
export class USyncContactProtocol {
  constructor() {
    this.name = "contact";
  }
  getQueryElement() {
    return { tag: "contact", attrs: {} };
  }
  getUserElement(user) {
    const attrs = {};
    if (user.type) {
      attrs.type = user.type;
    }
    return { tag: "contact", attrs: attrs, content: user.username || user.phone };
  }
  parser(node) {
    if (node.tag === "contact") {
      assertNodeErrorFree(node);
      return node?.attrs?.type === "in";
    }
    return false;
  }
}
