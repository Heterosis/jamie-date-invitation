import "@fontsource-variable/fraunces/index.css";
import "@fontsource/schoolbell/index.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/invitation.css";
import "./styles/tricks.css";
import "./styles/results.css";
import "./styles/maker.css";

import { parseInvitationConfig } from "./domain/invitation-config";
import { wireInvitation } from "./ui/invitation-controller";
import { mountInvitation } from "./ui/invitation-view";
import { mountMaker } from "./ui/maker-view";
import { installMotionPreference } from "./ui/motion";

installMotionPreference();

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app mount point");

const config = parseInvitationConfig(location.search);
if (config.make) {
  mountMaker(app, config);
} else {
  wireInvitation(mountInvitation(app, config), config);
}
