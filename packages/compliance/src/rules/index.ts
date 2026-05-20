import { APA_RULES } from "./apa";
import { CA_RULES } from "./states/ca";
import { NY_RULES } from "./states/ny";
import { TX_RULES } from "./states/tx";
import { FL_RULES } from "./states/fl";
import { IL_RULES } from "./states/il";

export { APA_RULES, CA_RULES, NY_RULES, TX_RULES, FL_RULES, IL_RULES };

export const ALL_SEED_RULES = [
  ...APA_RULES,
  ...CA_RULES,
  ...NY_RULES,
  ...TX_RULES,
  ...FL_RULES,
  ...IL_RULES,
];
