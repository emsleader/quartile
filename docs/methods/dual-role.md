# Dual-role check (ETH-04-DUAL)

Quartile's own method. It asks for a clear conflict-of-interest statement when the author works in, or owns a
stake in, the sector the paper studies.

## Inputs

1. **The manuscript.** Parsed locally (`core/text/parse.js`).
2. **The author profile.** A local YAML file. Quartile looks for it in this order:
   the `author_profile` path given to the tool, the environment variable `QUARTILE_AUTHOR_PROFILE`,
   then `$QUARTILE_HOME/author.yaml` (default `~/.quartile/author.yaml`). The file never leaves the machine and must
   never be committed. A fictional template is in `tests/fixtures/author.example.yaml`:

```yaml
name: "Dr. Alex Example"
affiliations:
  - { organisation: "Kestrel Motion Systems Ltd", role: "Managing Director", sectors: ["EMS", "fitness studio"] }
business_interests:
  - { organisation: "Bluefin Wellness Studios Kft", sectors: ["whole-body EMS"] }
```

If no profile is found, the dual-role check does not run, and `ethics_check` says so.

## Step 1: what sector does the paper study?

Quartile counts mentions of each sector in the sector table below. It ignores the reference list and the
statement sections (conflict of interest, ethics, data availability, funding), because the disclosure itself
names the company. A sector counts as studied when it has at least 3 mentions, or 1 mention in the title or abstract.

The bare abbreviation "EMS" counts for WB-EMS only when a clear WB-EMS term also appears (for example
"whole-body EMS", "electromyostimulation", "EMS studio"), and never when the paper uses EMS for
environmental management systems, emergency medical services, energy management systems or electronic
manufacturing services.

## Step 2: does the profile list that sector?

Each sector in the profile is mapped to the table:

- **exact**: the profile word is the sector key or one of its listed names (for example "EMS", "whole-body EMS",
  "electromyostimulation", "fitness studio") and it is the studied sector. Confidence **high**.
- **pattern**: the profile text contains a sector pattern but is not a listed name. Confidence medium.
- **related**: the profile sector is listed as related to the studied sector (WB-EMS and fitness are related,
  because WB-EMS is sold to and run in fitness studios). Confidence medium.
- **literal**: a profile sector that is not in the table counts when its own words appear at least 3 times in the
  paper. Confidence medium.

## Sector table (`SECTORS` in `core/roles/ethics_lib.js`)

| Key | Listed names (profile) | Counts as a mention in the paper | Related |
|---|---|---|---|
| wb-ems | EMS, WB-EMS, whole-body EMS, whole-body electromyostimulation, electromyostimulation, electrical muscle stimulation, EMS training, EMS studio(s), EMS equipment, EMS devices, EMS distribution | whole-body EMS, WB-EMS, electromyostimulation, electrical muscle stimulation, "EMS" + training/studio/device/equipment/suit/session/market/sector/industry/provider/operator/franchise/distribution | fitness |
| fitness | fitness, fitness studio(s), fitness centre/center, gym(s), health club(s), personal training, fitness industry, sport and fitness, boutique fitness, fitness services | fitness + studio/centre/club/industry/sector/market/facility/business/operator/service/chain; gym; health club; personal training | wb-ems |
| hospitality | hospitality, hotel(s), restaurant(s), tourism and hospitality, catering | hotel, restaurant, hospitality firms/industry/sector | — |
| agriculture | agriculture, agricultural, farming, farms, agribusiness, agri-food | farm, farmer, agriculture, agribusiness | — |
| printing | printing, print, print services, printing industry, commercial printing | print(ing) firms/companies/shops/houses/industry/sector/services, printers | — |

Names are compared after lower-casing and turning hyphens into spaces. New sectors are added to the table with a test.

## Step 3: does the disclosure name the role?

The disclosure is every section whose heading is a conflict-of-interest heading ("Conflict of interest",
"Declaration of competing interests", "Related parties", "Disclosure", ...) plus every sentence with
conflict-of-interest wording anywhere in the paper. The role counts as named when a sentence there:

- names the organisation (legal suffixes such as Ltd, Kft, GmbH, SRL are ignored), or
- has a role word (director, owner, owns, founder, shareholder, employee, consultant, distributor, franchise,
  business or financial interest, ...) together with a mention of the studied sector.

A negated mention ("The author has no financial interests in EMS companies") does not count (negation scope from
`core/text/negation.js`).

## Result

| Situation | Finding |
|---|---|
| Profile matches, no conflict-of-interest statement | ETH-04-DUAL, major, confidence by match type |
| Profile matches, statement does not name the role (e.g. "no competing interests") | ETH-04-DUAL, major |
| Profile matches, statement names the organisation or role | ETH-04-DUAL, note: "Disclosure present; check it names the role" |
| No match, no statement | ETH-04, minor (missing statement) |
| No match, statement present | nothing |

## Limits

- The profile describes the person running Quartile; Quartile assumes that person is an author of the paper.
- The sector table is small. A sector outside it is found only by its literal words.
- Quartile cannot tell whether a disclosure is complete; the note asks a human to check it.
