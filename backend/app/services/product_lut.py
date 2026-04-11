"""
Product Look-Up Table (LUT)
===========================
Maps scraped title fragments → (canonical_key, display_name).

Rules:
- Entries are checked in ORDER — put more specific variants (Pro, Slim, VR2)
  BEFORE the base model so they match first.
- Patterns are matched against the NORMALISED, alias-expanded title
  (lower-case, no accents, gaming aliases already expanded).
- canonical_key is used for grouping; display_name is shown in the UI.
"""
from __future__ import annotations

import re
from typing import NamedTuple


class LUTEntry(NamedTuple):
    key: str
    display: str
    pattern: re.Pattern[str]


def _e(key: str, display: str, pattern: str) -> LUTEntry:
    return LUTEntry(key=key, display=display, pattern=re.compile(pattern, re.IGNORECASE))


# fmt: off
_RAW: list[LUTEntry] = [

    # ── Sony PlayStation — Consoles ───────────────────────────────────────────
    _e("playstation_5_pro",         "PlayStation 5 Pro",
       r"\bplaystation\s*5\s+pro\b|\bps\s*5\s+pro\b|\bcfi.?7[0-9]{3}\b"),

    _e("playstation_5_slim",        "PlayStation 5 Slim",
       r"\bplaystation\s*5\s+slim\b|\bps\s*5\s+slim\b|\bcfi.?2[0-9]{3}\b"),

    _e("playstation_5",             "PlayStation 5",
       r"\bplaystation\s*5\b|\bps\s*5\b|\bcfi.?1[0-9]{3}\b"),

    _e("playstation_4_pro",         "PlayStation 4 Pro",
       r"\bplaystation\s*4\s+pro\b|\bps\s*4\s+pro\b|\bcuh.?7[0-9]{3}\b"),

    _e("playstation_4_slim",        "PlayStation 4 Slim",
       r"\bplaystation\s*4\s+slim\b|\bps\s*4\s+slim\b|\bcuh.?2[0-9]{3}\b"),

    _e("playstation_4",             "PlayStation 4",
       r"\bplaystation\s*4\b|\bps\s*4\b|\bcuh.?1[0-9]{3}\b"),

    _e("playstation_3_slim",        "PlayStation 3 Slim",
       r"\bplaystation\s*3\s+slim\b|\bps\s*3\s+slim\b"),

    _e("playstation_3_super_slim",  "PlayStation 3 Super Slim",
       r"\bplaystation\s*3\s+super\s+slim\b|\bps\s*3\s+super\s+slim\b"),

    _e("playstation_3",             "PlayStation 3",
       r"\bplaystation\s*3\b|\bps\s*3\b"),

    _e("playstation_2",             "PlayStation 2",
       r"\bplaystation\s*2\b|\bps\s*2\b"),

    _e("playstation_1",             "PlayStation 1",
       r"\bplaystation\s*1\b|\bps\s*1\b|\bpsx\b|\bps\s+one\b"),

    # ── Sony PlayStation — Handhelds ──────────────────────────────────────────
    _e("ps_vita_slim",              "PS Vita Slim",
       r"\bps\s*vita\s+slim\b|\bpch.?2[0-9]{3}\b"),

    _e("ps_vita",                   "PS Vita",
       r"\bps\s*vita\b|\bpch.?1[0-9]{3}\b"),

    _e("psp_3000",                  "PSP 3000",
       r"\bpsp.?3000\b|\bpsp.?e1[0-9]{3}\b"),

    _e("psp_2000",                  "PSP 2000",
       r"\bpsp.?2000\b"),

    _e("psp_1000",                  "PSP 1000",
       r"\bpsp.?1000\b"),

    _e("psp",                       "PSP",
       r"\bpsp\b|\bplaystation\s+portable\b"),

    # ── Sony PlayStation — Periféricos ────────────────────────────────────────
    _e("playstation_vr2",           "PlayStation VR2",
       r"\bplaystation\s+vr\s*2\b|\bps\s*vr\s*2\b|\bpsvr\s*2\b|\bcfij.?1[0-9]{4}\b"),

    _e("playstation_vr",            "PlayStation VR",
       r"\bplaystation\s+vr\b|\bps\s*vr\b|\bpsvr\b|\bcuh.?zvr\b"),

    _e("playstation_portal",        "PlayStation Portal",
       r"\bplaystation\s+portal\b|\bps\s+portal\b|\bcfi.?y[0-9]{4}\b"),

    _e("playstation_move",          "PlayStation Move",
       r"\bplaystation\s+move\b|\bps\s+move\b"),

    _e("playstation_camera",        "PlayStation Camera",
       r"\bplaystation\s+camera\b|\bps\s+camera\b"),

    _e("dualsense_edge",            "DualSense Edge",
       r"\bdualsense\s+edge\b|\bcfi.?zct1e\b"),

    _e("dualsense",                 "DualSense",
       r"\bdualsense\b|\bcfi.?zct1\b"),

    _e("dualshock_4",               "DualShock 4",
       r"\bdualshock\s*4\b|\bcuh.?zct2\b"),

    _e("dualshock_3",               "DualShock 3",
       r"\bdualshock\s*3\b|\bcech.?zct\b"),

    # ── Microsoft Xbox — Consoles ─────────────────────────────────────────────
    _e("xbox_series_x",             "Xbox Series X",
       r"\bxbox\s+series\s+x\b|\bxsx\b|\brrt.?0000\b"),

    _e("xbox_series_s",             "Xbox Series S",
       r"\bxbox\s+series\s+s\b|\bxss\b|\brrs.?0000\b"),

    _e("xbox_one_x",                "Xbox One X",
       r"\bxbox\s+one\s+x\b|\bfmp.?0000\b"),

    _e("xbox_one_s_all_digital",    "Xbox One S All-Digital",
       r"\bxbox\s+one\s+s\s+all.?digital\b"),

    _e("xbox_one_s",                "Xbox One S",
       r"\bxbox\s+one\s+s\b|\bzq9.?0000\b"),

    _e("xbox_one",                  "Xbox One",
       r"\bxbox\s+one\b"),

    _e("xbox_360_slim",             "Xbox 360 Slim",
       r"\bxbox\s+360\s+slim\b"),

    _e("xbox_360",                  "Xbox 360",
       r"\bxbox\s+360\b"),

    _e("xbox_original",             "Xbox",
       r"\bxbox\s+original\b"),

    # ── Microsoft Xbox — Periféricos ──────────────────────────────────────────
    _e("xbox_elite_controller_2",   "Xbox Elite Controller Series 2",
       r"\bxbox\s+elite.*(series\s*2|v2)\b|\belite\s+series\s*2\b"),

    _e("xbox_elite_controller",     "Xbox Elite Controller",
       r"\bxbox\s+elite\s+controller\b|\belite\s+controller\b"),

    _e("xbox_wireless_controller",  "Xbox Wireless Controller",
       r"\bxbox\s+wireless\s+controller\b|\bxbox\s+controle\s+sem\s+fio\b"),

    # ── Nintendo — Consoles ───────────────────────────────────────────────────
    _e("nintendo_switch_2",         "Nintendo Switch 2",
       r"\bnintendo\s+switch\s*2\b"),

    _e("nintendo_switch_oled",      "Nintendo Switch OLED",
       r"\bnintendo\s+switch\s+oled\b|\bheg.?001\b"),

    _e("nintendo_switch_lite",      "Nintendo Switch Lite",
       r"\bnintendo\s+switch\s+lite\b|\bhdh.?001\b"),

    _e("nintendo_switch",           "Nintendo Switch",
       r"\bnintendo\s+switch\b|\bhac.?001\b"),

    _e("nintendo_wii_u",            "Nintendo Wii U",
       r"\bnintendo\s+wii\s*u\b|\bwii\s*u\b"),

    _e("nintendo_wii",              "Nintendo Wii",
       r"\bnintendo\s+wii\b|\bwii\b"),

    _e("nintendo_gamecube",         "Nintendo GameCube",
       r"\bnintendo\s+gamecube\b|\bgamecube\b|\bdol.?001\b"),

    _e("nintendo_64",               "Nintendo 64",
       r"\bnintendo\s+64\b|\bn64\b"),

    _e("super_nintendo",            "Super Nintendo",
       r"\bsuper\s+nintendo\b|\bsnes\b|\bsuper\s+nes\b|\bsuperfamicom\b"),

    _e("nintendo_nes",              "Nintendo NES",
       r"\bnintendo\s+nes\b|\bnes\b|\bfamicom\b"),

    # ── Nintendo — Handhelds ──────────────────────────────────────────────────
    _e("new_nintendo_3ds_xl",       "New Nintendo 3DS XL",
       r"\bnew\s+nintendo\s+3ds\s+xl\b|\bnew\s+3ds\s+xl\b"),

    _e("new_nintendo_3ds",          "New Nintendo 3DS",
       r"\bnew\s+nintendo\s+3ds\b|\bnew\s+3ds\b"),

    _e("nintendo_3ds_xl",           "Nintendo 3DS XL",
       r"\bnintendo\s+3ds\s+xl\b|\b3ds\s+xl\b"),

    _e("nintendo_2ds_xl",           "Nintendo 2DS XL",
       r"\bnintendo\s+2ds\s+xl\b|\b2ds\s+xl\b"),

    _e("nintendo_3ds",              "Nintendo 3DS",
       r"\bnintendo\s+3ds\b|\b3ds\b"),

    _e("nintendo_2ds",              "Nintendo 2DS",
       r"\bnintendo\s+2ds\b|\b2ds\b"),

    _e("game_boy_advance_sp",       "Game Boy Advance SP",
       r"\bgame\s*boy\s+advance\s+sp\b|\bgba\s+sp\b|\bags.?001\b"),

    _e("game_boy_advance",          "Game Boy Advance",
       r"\bgame\s*boy\s+advance\b|\bgba\b|\bagb.?001\b"),

    _e("game_boy_color",            "Game Boy Color",
       r"\bgame\s*boy\s+color\b|\bgbc\b|\bcgb.?001\b"),

    _e("game_boy",                  "Game Boy",
       r"\bgame\s*boy\b|\bdmg.?001\b"),

    _e("nintendo_ds_lite",          "Nintendo DS Lite",
       r"\bnintendo\s+ds\s+lite\b|\bds\s+lite\b|\busg.?001\b"),

    _e("nintendo_dsi_xl",           "Nintendo DSi XL",
       r"\bnintendo\s+dsi\s+xl\b|\bdsi\s+xl\b|\buts.?001\b"),

    _e("nintendo_dsi",              "Nintendo DSi",
       r"\bnintendo\s+dsi\b|\bdsi\b|\btwl.?001\b"),

    _e("nintendo_ds",               "Nintendo DS",
       r"\bnintendo\s+ds\b(?!\s+lite)|\bnds\b|\bntr.?001\b"),

    # ── Nintendo — Periféricos ────────────────────────────────────────────────
    _e("joy_con",                   "Joy-Con",
       r"\bjoy.?con\b"),

    _e("nintendo_pro_controller",   "Nintendo Pro Controller",
       r"\bnintendo\s+pro\s+controller\b|\bpro\s+controller\s+switch\b"),

    # ── Valve ─────────────────────────────────────────────────────────────────
    _e("steam_deck_oled",           "Steam Deck OLED",
       r"\bsteam\s+deck\s+oled\b"),

    _e("steam_deck",                "Steam Deck",
       r"\bsteam\s+deck\b"),

    _e("steam_controller",          "Steam Controller",
       r"\bsteam\s+controller\b"),

    _e("steam_link",                "Steam Link",
       r"\bsteam\s+link\b"),

    # ── Sega ──────────────────────────────────────────────────────────────────
    _e("sega_dreamcast",            "Sega Dreamcast",
       r"\bsega\s+dreamcast\b|\bdreamcast\b"),

    _e("sega_saturn",               "Sega Saturn",
       r"\bsega\s+saturn\b|\bsaturn\b"),

    _e("sega_mega_drive",           "Sega Mega Drive",
       r"\bsega\s+(mega\s+drive|genesis)\b|\bmega\s+drive\b|\bgenesis\b"),

    _e("sega_game_gear",            "Sega Game Gear",
       r"\bsega\s+game\s+gear\b|\bgame\s+gear\b"),

    # ── Volantes / Racing Wheels ──────────────────────────────────────────────
    _e("logitech_g923",             "Logitech G923",
       r"\blogitech\s+g923\b"),

    _e("logitech_g29",              "Logitech G29",
       r"\blogitech\s+g29\b"),

    _e("logitech_g27",              "Logitech G27",
       r"\blogitech\s+g27\b"),

    _e("logitech_g25",              "Logitech G25",
       r"\blogitech\s+g25\b"),

    _e("thrustmaster_t300",         "Thrustmaster T300RS",
       r"\bthrustmaster\s+t.?300\b"),

    _e("thrustmaster_t248",         "Thrustmaster T248",
       r"\bthrustmaster\s+t.?248\b"),

    _e("thrustmaster_t150",         "Thrustmaster T150",
       r"\bthrustmaster\s+t.?150\b"),

    _e("thrustmaster_t80",          "Thrustmaster T80",
       r"\bthrustmaster\s+t.?80\b"),

    _e("fanatec_csl_dd",            "Fanatec CSL DD",
       r"\bfanatec\s+csl\s+dd\b"),

    _e("fanatec_csl_elite",         "Fanatec CSL Elite",
       r"\bfanatec\s+csl\s+elite\b"),

    _e("volante_generic",           "Volante",
       r"\bvolante\b|\bracing\s+wheel\b|\bsteering\s+wheel\b"),

]
# fmt: on

# ── Perfume LUT ───────────────────────────────────────────────────────────────
# Maps scraped title → (key, canonical brand + fragrance name).
# Concentration (EDP/EDT) and volume (100ml) are extracted separately.
# Patterns match NORMALISED titles (lower-case, no accents).
# Order: more specific names before shorter brand-only patterns.

class PerfumeLUTEntry(NamedTuple):
    key: str
    brand: str        # e.g. "Dior"
    fragrance: str    # e.g. "Sauvage"
    pattern: re.Pattern[str]


def _p(key: str, brand: str, fragrance: str, pattern: str) -> PerfumeLUTEntry:
    return PerfumeLUTEntry(
        key=key, brand=brand, fragrance=fragrance,
        pattern=re.compile(pattern, re.IGNORECASE),
    )


# fmt: off
_PERFUME_RAW: list[PerfumeLUTEntry] = [

    # ── Dior ──────────────────────────────────────────────────────────────────
    _p("dior_sauvage",              "Dior", "Sauvage",
       r"\b(christian\s+)?dior\b.*\bsauvage\b|\bsauvage\b.*\b(christian\s+)?dior\b"),

    _p("dior_jadore",               "Dior", "J'adore",
       r"\b(christian\s+)?dior\b.*\bj.?adore\b|\bj.?adore\b.*\b(christian\s+)?dior\b"),

    _p("dior_miss_dior",            "Dior", "Miss Dior",
       r"\bmiss\s+dior\b"),

    _p("dior_bleu",                 "Dior", "Bleu de Dior",
       r"\bbleu\s+de\s+dior\b"),

    _p("dior_fahrenheit",           "Dior", "Fahrenheit",
       r"\b(christian\s+)?dior\b.*\bfahrenheit\b|\bfahrenheit\b.*\b(christian\s+)?dior\b"),

    _p("dior_hypnotic_poison",      "Dior", "Hypnotic Poison",
       r"\bhypnotic\s+poison\b"),

    _p("dior_poison_girl",          "Dior", "Poison Girl",
       r"\bpoison\s+girl\b"),

    _p("dior_joy",                  "Dior", "Joy by Dior",
       r"\bjoy\s+by\s+dior\b|\b(christian\s+)?dior\b.*\bjoy\b(?!\s+con)"),

    # ── Chanel ────────────────────────────────────────────────────────────────
    _p("chanel_n5",                 "Chanel", "N°5",
       r"\bchanel\b.*\bn[o°º]?\s*5\b|\bn[o°º]?\s*5\b.*\bchanel\b"),

    _p("chanel_bleu",               "Chanel", "Bleu de Chanel",
       r"\bbleu\s+de\s+chanel\b"),

    _p("chanel_coco_mademoiselle",  "Chanel", "Coco Mademoiselle",
       r"\bcoco\s+mademoiselle\b"),

    _p("chanel_chance_eau_tendre",  "Chanel", "Chance Eau Tendre",
       r"\bchance\s+eau\s+tendre\b"),

    _p("chanel_chance_eau_fraiche", "Chanel", "Chance Eau Fraîche",
       r"\bchance\s+eau\s+fra[iî]che\b"),

    _p("chanel_chance",             "Chanel", "Chance",
       r"\bchanel\b.*\bchance\b|\bchance\b.*\bchanel\b"),

    _p("chanel_allure_homme_sport", "Chanel", "Allure Homme Sport",
       r"\ballure\s+homme\s+sport\b"),

    _p("chanel_allure_homme",       "Chanel", "Allure Homme",
       r"\ballure\s+homme\b"),

    _p("chanel_allure",             "Chanel", "Allure",
       r"\bchanel\b.*\ballure\b|\ballure\b.*\bchanel\b"),

    _p("chanel_gabrielle",          "Chanel", "Gabrielle",
       r"\bchanel\b.*\bgabrielle\b|\bgabrielle\b.*\bchanel\b"),

    _p("chanel_coco_noir",          "Chanel", "Coco Noir",
       r"\bcoco\s+noir\b"),

    # ── Yves Saint Laurent (YSL) ──────────────────────────────────────────────
    _p("ysl_black_opium",           "YSL", "Black Opium",
       r"\bblack\s+opium\b"),

    _p("ysl_libre",                 "YSL", "Libre",
       r"\b(yves\s+saint\s+laurent|ysl)\b.*\blibre\b|\blibre\b.*\b(yves\s+saint\s+laurent|ysl)\b"),

    _p("ysl_y",                     "YSL", "Y",
       r"\b(yves\s+saint\s+laurent|ysl)\b.*\by\s+(homme|for\s+men|edp|edt)\b"),

    _p("ysl_mon_paris",             "YSL", "Mon Paris",
       r"\bmon\s+paris\b"),

    _p("ysl_la_nuit",               "YSL", "La Nuit de l'Homme",
       r"\bla\s+nuit\s+de\s+l.?homme\b"),

    _p("ysl_kouros",                "YSL", "Kouros",
       r"\b(yves\s+saint\s+laurent|ysl)\b.*\bkouros\b|\bkouros\b.*\b(yves\s+saint\s+laurent|ysl)\b"),

    _p("ysl_opium",                 "YSL", "Opium",
       r"\b(yves\s+saint\s+laurent|ysl)\b.*\bopium\b|\bopium\b.*\b(yves\s+saint\s+laurent|ysl)\b"),

    # ── Giorgio Armani ────────────────────────────────────────────────────────
    _p("armani_acqua_di_gio_profumo","Giorgio Armani", "Acqua di Giò Profumo",
       r"\bacqua\s+di\s+gi[oò]\s+profumo\b"),

    _p("armani_acqua_di_gio_profondo","Giorgio Armani", "Acqua di Giò Profondo",
       r"\bacqua\s+di\s+gi[oò]\s+profondo\b"),

    _p("armani_acqua_di_gio",       "Giorgio Armani", "Acqua di Giò",
       r"\bacqua\s+di\s+gi[oò]\b"),

    _p("armani_si_passione",        "Giorgio Armani", "Sì Passione",
       r"\bsi\s+passione\b.*\barmani\b|\barmani\b.*\bsi\s+passione\b"),

    _p("armani_si",                 "Giorgio Armani", "Sì",
       r"\b(giorgio\s+)?armani\b.*\bsi\b(?!\s+passione)|\bsi\b.*\b(giorgio\s+)?armani\b"),

    _p("armani_stronger_with_you",  "Giorgio Armani", "Stronger with You",
       r"\bstronger\s+with\s+you\b"),

    _p("armani_my_way",             "Giorgio Armani", "My Way",
       r"\b(giorgio\s+)?armani\b.*\bmy\s+way\b|\bmy\s+way\b.*\b(giorgio\s+)?armani\b"),

    _p("armani_code",               "Giorgio Armani", "Armani Code",
       r"\barmani\s+code\b"),

    # ── Paco Rabanne ──────────────────────────────────────────────────────────
    _p("rabanne_1_million_parfum",  "Paco Rabanne", "1 Million Parfum",
       r"\b1\s+million\s+parfum\b"),

    _p("rabanne_1_million_lucky",   "Paco Rabanne", "1 Million Lucky",
       r"\b1\s+million\s+lucky\b"),

    _p("rabanne_1_million",         "Paco Rabanne", "1 Million",
       r"\b1\s+million\b(?!\s+(parfum|lucky|prive|elixir))"),

    _p("rabanne_invictus_legend",   "Paco Rabanne", "Invictus Legend",
       r"\binvictus\s+legend\b"),

    _p("rabanne_invictus_platinum", "Paco Rabanne", "Invictus Platinum",
       r"\binvictus\s+platinum\b"),

    _p("rabanne_invictus_victory",  "Paco Rabanne", "Invictus Victory",
       r"\binvictus\s+victory\b"),

    _p("rabanne_invictus_aqua",     "Paco Rabanne", "Invictus Aqua",
       r"\binvictus\s+aqua\b"),

    _p("rabanne_invictus",          "Paco Rabanne", "Invictus",
       r"\binvictus\b"),

    _p("rabanne_lady_million",      "Paco Rabanne", "Lady Million",
       r"\blady\s+million\b"),

    _p("rabanne_phantom",           "Paco Rabanne", "Phantom",
       r"\b(paco\s+rabanne|rabanne)\b.*\bphantom\b|\bphantom\b.*\b(paco\s+rabanne|rabanne)\b"),

    _p("rabanne_fame",              "Paco Rabanne", "Fame",
       r"\b(paco\s+rabanne|rabanne)\b.*\bfame\b|\bfame\b.*\b(paco\s+rabanne|rabanne)\b"),

    # ── Hugo Boss ─────────────────────────────────────────────────────────────
    _p("boss_bottled_parfum",       "Hugo Boss", "Boss Bottled Parfum",
       r"\bboss\s+bottled\s+parfum\b"),

    _p("boss_bottled_night",        "Hugo Boss", "Boss Bottled Night",
       r"\bboss\s+bottled\s+night\b"),

    _p("boss_bottled",              "Hugo Boss", "Boss Bottled",
       r"\bboss\s+bottled\b"),

    _p("boss_the_scent",            "Hugo Boss", "The Scent",
       r"\b(hugo\s+boss|boss)\b.*\bthe\s+scent\b|\bthe\s+scent\b.*\b(hugo\s+boss|boss)\b"),

    _p("boss_hugo_man",             "Hugo Boss", "Hugo Man",
       r"\bhugo\s+(man|boss\s+man)\b"),

    _p("boss_iced",                 "Hugo Boss", "Boss Iced",
       r"\bboss\s+iced\b"),

    # ── Versace ───────────────────────────────────────────────────────────────
    _p("versace_eros_flame",        "Versace", "Eros Flame",
       r"\beros\s+flame\b"),

    _p("versace_eros",              "Versace", "Eros",
       r"\bversace\b.*\beros\b|\beros\b.*\bversace\b"),

    _p("versace_dylan_blue",        "Versace", "Dylan Blue",
       r"\bdylan\s+blue\b"),

    _p("versace_crystal_noir",      "Versace", "Crystal Noir",
       r"\bcrystal\s+noir\b"),

    _p("versace_bright_crystal",    "Versace", "Bright Crystal",
       r"\bbright\s+crystal\b"),

    _p("versace_yellow_diamond",    "Versace", "Yellow Diamond",
       r"\byellow\s+diamond\b.*\bversace\b|\bversace\b.*\byellow\s+diamond\b"),

    # ── Dolce & Gabbana ───────────────────────────────────────────────────────
    _p("dg_light_blue",             "Dolce & Gabbana", "Light Blue",
       r"\b(dolce\s*[&e]\s*gabbana|d\s*[&e]\s*g)\b.*\blight\s+blue\b|\blight\s+blue\b.*\b(dolce|d\s*[&e]\s*g)\b"),

    _p("dg_the_one",                "Dolce & Gabbana", "The One",
       r"\b(dolce\s*[&e]\s*gabbana|d\s*[&e]\s*g)\b.*\bthe\s+one\b|\bthe\s+one\b.*\b(dolce|d\s*[&e]\s*g)\b"),

    _p("dg_pour_femme",             "Dolce & Gabbana", "Pour Femme",
       r"\b(dolce\s*[&e]\s*gabbana|d\s*[&e]\s*g)\b.*\bpour\s+femme\b"),

    _p("dg_k",                      "Dolce & Gabbana", "K by Dolce & Gabbana",
       r"\bk\s+by\s+(dolce\s*[&e]\s*gabbana|d\s*[&e]\s*g)\b"),

    # ── Lancôme ───────────────────────────────────────────────────────────────
    _p("lancome_la_vie_est_belle",  "Lancôme", "La Vie est Belle",
       r"\bla\s+vie\s+est\s+belle\b"),

    _p("lancome_idole",             "Lancôme", "Idôle",
       r"\bidole\b.*\blanc[oô]me\b|\blanc[oô]me\b.*\bidole\b"),

    _p("lancome_tresor",            "Lancôme", "Trésor",
       r"\btresor\b.*\blanc[oô]me\b|\blanc[oô]me\b.*\btresor\b"),

    _p("lancome_hypnose",           "Lancôme", "Hypnôse",
       r"\bhypnose\b.*\blanc[oô]me\b|\blanc[oô]me\b.*\bhypnose\b"),

    # ── Calvin Klein ──────────────────────────────────────────────────────────
    _p("ck_one",                    "Calvin Klein", "CK One",
       r"\bck\s+one\b|\bcalvin\s+klein\s+one\b"),

    _p("ck_eternity",               "Calvin Klein", "Eternity",
       r"\b(calvin\s+klein|ck)\b.*\beternity\b|\beternity\b.*\b(calvin\s+klein|ck)\b"),

    _p("ck_obsession",              "Calvin Klein", "Obsession",
       r"\b(calvin\s+klein|ck)\b.*\bobsession\b|\bobsession\b.*\b(calvin\s+klein|ck)\b"),

    _p("ck_euphoria",               "Calvin Klein", "Euphoria",
       r"\b(calvin\s+klein|ck)\b.*\beuforia\b|\beuphoria\b.*\b(calvin\s+klein|ck)\b"),

    _p("ck_in2u",                   "Calvin Klein", "CK IN2U",
       r"\bck\s+in2u\b|\bin2u\b.*\b(calvin\s+klein|ck)\b"),

    # ── Carolina Herrera ──────────────────────────────────────────────────────
    _p("ch_good_girl_blush",        "Carolina Herrera", "Good Girl Blush",
       r"\bgood\s+girl\s+blush\b"),

    _p("ch_good_girl_heaven",       "Carolina Herrera", "Good Girl Heaven",
       r"\bgood\s+girl\s+heaven\b"),

    _p("ch_good_girl",              "Carolina Herrera", "Good Girl",
       r"\bgood\s+girl\b(?!\s+(blush|heaven))"),

    _p("ch_bad_boy",                "Carolina Herrera", "Bad Boy",
       r"\bbad\s+boy\b.*\b(carolina\s+herrera|ch)\b|\b(carolina\s+herrera|ch)\b.*\bbad\s+boy\b"),

    _p("ch_212_vip",                "Carolina Herrera", "212 VIP",
       r"\b212\s+vip\b"),

    _p("ch_212_sexy",               "Carolina Herrera", "212 Sexy",
       r"\b212\s+sexy\b"),

    _p("ch_212",                    "Carolina Herrera", "212",
       r"\b(carolina\s+herrera|ch)\b.*\b212\b|\b212\b.*\b(carolina\s+herrera|ch)\b"),

    _p("ch_ch",                     "Carolina Herrera", "CH",
       r"\bcarolina\s+herrera\b.*\bch\b|\bch\b.*\bcarolina\s+herrera\b"),

    # ── Thierry Mugler ────────────────────────────────────────────────────────
    _p("mugler_alien_goddess",      "Mugler", "Alien Goddess",
       r"\balien\s+goddess\b"),

    _p("mugler_alien",              "Mugler", "Alien",
       r"\b(thierry\s+)?mugler\b.*\balien\b|\balien\b.*\b(thierry\s+)?mugler\b"),

    _p("mugler_angel_elixir",       "Mugler", "Angel Elixir",
       r"\bangel\s+elixir\b.*\bmugler\b|\bmugler\b.*\bangel\s+elixir\b"),

    _p("mugler_angel",              "Mugler", "Angel",
       r"\b(thierry\s+)?mugler\b.*\bangel\b|\bangel\b.*\b(thierry\s+)?mugler\b"),

    _p("mugler_aura",               "Mugler", "Aura",
       r"\b(thierry\s+)?mugler\b.*\baura\b|\baura\b.*\b(thierry\s+)?mugler\b"),

    # ── Viktor & Rolf ─────────────────────────────────────────────────────────
    _p("vr_flowerbomb",             "Viktor & Rolf", "Flowerbomb",
       r"\bflowerbomb\b"),

    _p("vr_spicebomb_extreme",      "Viktor & Rolf", "Spicebomb Extreme",
       r"\bspicebomb\s+extreme\b"),

    _p("vr_spicebomb",              "Viktor & Rolf", "Spicebomb",
       r"\bspicebomb\b"),

    # ── Jean Paul Gaultier ────────────────────────────────────────────────────
    _p("jpg_le_male_elixir",        "Jean Paul Gaultier", "Le Mâle Elixir",
       r"\ble\s+male\s+elixir\b"),

    _p("jpg_le_male_parfum",        "Jean Paul Gaultier", "Le Mâle Parfum",
       r"\ble\s+male\s+parfum\b"),

    _p("jpg_le_male",               "Jean Paul Gaultier", "Le Mâle",
       r"\ble\s+male\b"),

    _p("jpg_classique",             "Jean Paul Gaultier", "Classique",
       r"\b(jean\s+paul\s+gaultier|jpg)\b.*\bclassique\b|\bclassique\b.*\b(jean\s+paul\s+gaultier|jpg)\b"),

    _p("jpg_scandal",               "Jean Paul Gaultier", "Scandal",
       r"\b(jean\s+paul\s+gaultier|jpg)\b.*\bscandal\b|\bscandal\b.*\b(jean\s+paul\s+gaultier|jpg)\b"),

    # ── Gucci ─────────────────────────────────────────────────────────────────
    _p("gucci_bloom",               "Gucci", "Bloom",
       r"\bgucci\b.*\bbloom\b|\bbloom\b.*\bgucci\b"),

    _p("gucci_guilty_black",        "Gucci", "Guilty Black",
       r"\bgucci\b.*\bguilty\s+black\b"),

    _p("gucci_guilty",              "Gucci", "Guilty",
       r"\bgucci\b.*\bguilty\b|\bguilty\b.*\bgucci\b"),

    _p("gucci_flora",               "Gucci", "Flora",
       r"\bgucci\b.*\bflora\b|\bflora\b.*\bgucci\b"),

    _p("gucci_bamboo",              "Gucci", "Bamboo",
       r"\bgucci\b.*\bbamboo\b|\bbamboo\b.*\bgucci\b"),

    # ── Burberry ──────────────────────────────────────────────────────────────
    _p("burberry_her",              "Burberry", "Her",
       r"\bburberry\b.*\bher\b|\bher\b.*\bburberry\b"),

    _p("burberry_brit",             "Burberry", "Brit",
       r"\bburberry\b.*\bbrit\b|\bbrit\b.*\bburberry\b"),

    _p("burberry_mr_burberry",      "Burberry", "Mr. Burberry",
       r"\bmr\s*\.?\s*burberry\b"),

    _p("burberry_weekend",          "Burberry", "Weekend",
       r"\bburberry\b.*\bweekend\b|\bweekend\b.*\bburberry\b"),

    # ── Marc Jacobs ───────────────────────────────────────────────────────────
    _p("mj_daisy_love",             "Marc Jacobs", "Daisy Love",
       r"\bdaisy\s+love\b.*\bmarc\s+jacobs\b|\bmarc\s+jacobs\b.*\bdaisy\s+love\b"),

    _p("mj_daisy",                  "Marc Jacobs", "Daisy",
       r"\bdaisy\b.*\bmarc\s+jacobs\b|\bmarc\s+jacobs\b.*\bdaisy\b"),

    _p("mj_dot",                    "Marc Jacobs", "Dot",
       r"\bdot\b.*\bmarc\s+jacobs\b|\bmarc\s+jacobs\b.*\bdot\b"),

    # ── Narciso Rodriguez ─────────────────────────────────────────────────────
    _p("narciso_for_her_musc",      "Narciso Rodriguez", "For Her Musc",
       r"\bnarciso\b.*\bfor\s+her\s+musc\b"),

    _p("narciso_for_her",           "Narciso Rodriguez", "For Her",
       r"\bnarciso\b.*\bfor\s+her\b|\bfor\s+her\b.*\bnarciso\b"),

    _p("narciso_for_him",           "Narciso Rodriguez", "For Him",
       r"\bnarciso\b.*\bfor\s+him\b|\bfor\s+him\b.*\bnarciso\b"),

    # ── Valentino ─────────────────────────────────────────────────────────────
    _p("valentino_born_in_roma",    "Valentino", "Donna Born in Roma",
       r"\b(donna\s+)?born\s+in\s+roma\b"),

    _p("valentino_uomo_born_in_roma","Valentino", "Uomo Born in Roma",
       r"\buomo\s+born\s+in\s+roma\b"),

    _p("valentino_voce_viva",       "Valentino", "Voce Viva",
       r"\bvoce\s+viva\b"),

    # ── Givenchy ──────────────────────────────────────────────────────────────
    _p("givenchy_linterdit",        "Givenchy", "L'Interdit",
       r"\bl.?interdit\b.*\bgivenchy\b|\bgivenchy\b.*\bl.?interdit\b"),

    _p("givenchy_gentleman",        "Givenchy", "Gentleman",
       r"\bgivenchy\b.*\bgentleman\b|\bgentleman\b.*\bgivenchy\b"),

    _p("givenchy_irresistible",     "Givenchy", "Irrésistible",
       r"\birr[eé]sistible\b.*\bgivenchy\b|\bgivenchy\b.*\birr[eé]sistible\b"),

    # ── Hermès ────────────────────────────────────────────────────────────────
    _p("hermes_terre",              "Hermès", "Terre d'Hermès",
       r"\bterre\s+d.?herm[eè]s\b|\bterre\b.*\bherm[eè]s\b"),

    _p("hermes_twilly",             "Hermès", "Twilly d'Hermès",
       r"\btwilly\b"),

    _p("hermes_h24",                "Hermès", "H24",
       r"\bherm[eè]s\b.*\bh24\b|\bh24\b.*\bherm[eè]s\b"),

    # ── Tom Ford ──────────────────────────────────────────────────────────────
    _p("tf_black_orchid",           "Tom Ford", "Black Orchid",
       r"\bblack\s+orchid\b"),

    _p("tf_tobacco_vanille",        "Tom Ford", "Tobacco Vanille",
       r"\btobacco\s+vanille\b"),

    _p("tf_oud_wood",               "Tom Ford", "Oud Wood",
       r"\boud\s+wood\b.*\btom\s+ford\b|\btom\s+ford\b.*\boud\s+wood\b"),

    _p("tf_lost_cherry",            "Tom Ford", "Lost Cherry",
       r"\blost\s+cherry\b"),

    _p("tf_neroli_portofino",       "Tom Ford", "Neroli Portofino",
       r"\bneroli\s+portofino\b"),

    # ── Maison Margiela Replica ───────────────────────────────────────────────
    _p("replica_by_the_fireplace",  "Maison Margiela", "Replica By the Fireplace",
       r"\bby\s+the\s+fireplace\b"),

    _p("replica_jazz_club",         "Maison Margiela", "Replica Jazz Club",
       r"\bjazz\s+club\b.*\brepli[ck]a\b|\brepli[ck]a\b.*\bjazz\s+club\b"),

    _p("replica_beach_walk",        "Maison Margiela", "Replica Beach Walk",
       r"\bbeach\s+walk\b"),

    _p("replica_flower_market",     "Maison Margiela", "Replica Flower Market",
       r"\bflower\s+market\b"),

    _p("replica_generic",           "Maison Margiela", "Replica",
       r"\b(maison\s+margiela|margiela)\b.*\brepli[ck]a\b|\brepli[ck]a\b.*\b(maison\s+margiela|margiela)\b"),

    # ── Azzaro ────────────────────────────────────────────────────────────────
    _p("azzaro_wanted_by_night",    "Azzaro", "Wanted by Night",
       r"\bwanted\s+by\s+night\b"),

    _p("azzaro_wanted",             "Azzaro", "Wanted",
       r"\bazzaro\b.*\bwanted\b|\bwanted\b.*\bazzaro\b"),

    _p("azzaro_chrome_united",      "Azzaro", "Chrome United",
       r"\bchrome\s+united\b"),

    _p("azzaro_chrome",             "Azzaro", "Chrome",
       r"\bazzaro\b.*\bchrome\b|\bchrome\b.*\bazzaro\b"),

    # ── Bvlgari ───────────────────────────────────────────────────────────────
    _p("bvlgari_man_in_black",      "Bvlgari", "Man in Black",
       r"\bman\s+in\s+black\b.*\bbvlgari\b|\bbvlgari\b.*\bman\s+in\s+black\b"),

    _p("bvlgari_omnia_crystalline", "Bvlgari", "Omnia Crystalline",
       r"\bomnia\s+crystalline\b"),

    _p("bvlgari_omnia",             "Bvlgari", "Omnia",
       r"\bbvlgari\b.*\bomnia\b|\bomnia\b.*\bbvlgari\b"),

    _p("bvlgari_aqva",              "Bvlgari", "Aqva",
       r"\bbvlgari\b.*\baqva\b|\baqva\b.*\bbvlgari\b"),

    # ── Ralph Lauren ──────────────────────────────────────────────────────────
    _p("rl_polo_blue",              "Ralph Lauren", "Polo Blue",
       r"\bpolo\s+blue\b"),

    _p("rl_polo_red",               "Ralph Lauren", "Polo Red",
       r"\bpolo\s+red\b"),

    _p("rl_polo_black",             "Ralph Lauren", "Polo Black",
       r"\bpolo\s+black\b"),

    _p("rl_polo_green",             "Ralph Lauren", "Polo",
       r"\bralph\s+lauren\b.*\bpolo\b|\bpolo\b.*\bralph\s+lauren\b"),

    _p("rl_romance",                "Ralph Lauren", "Romance",
       r"\bralph\s+lauren\b.*\bromance\b|\bromance\b.*\bralph\s+lauren\b"),

    # ── Lattafa ───────────────────────────────────────────────────────────────
    _p("lattafa_bade_al_oud",       "Lattafa", "Bade'e Al Oud",
       r"\bbade.?e?\s*al\s+oud\b"),

    _p("lattafa_raghba",            "Lattafa", "Raghba",
       r"\braghba\b"),

    _p("lattafa_asad",              "Lattafa", "Asad",
       r"\blattafa\b.*\basad\b|\basad\b.*\blattafa\b"),

    _p("lattafa_yara",              "Lattafa", "Yara",
       r"\blattafa\b.*\byara\b|\byara\b.*\blattafa\b"),

    _p("lattafa_khamrah",           "Lattafa", "Khamrah",
       r"\bkhamrah\b"),

    _p("lattafa_oud_mood",          "Lattafa", "Oud Mood",
       r"\boud\s+mood\b"),

    # ── Armaf ─────────────────────────────────────────────────────────────────
    _p("armaf_cdni_intense",        "Armaf", "Club de Nuit Intense",
       r"\bclub\s+de\s+nuit\s+intense\b"),

    _p("armaf_cdni_man",            "Armaf", "Club de Nuit Intense Man",
       r"\bclub\s+de\s+nuit\s+intense\s+man\b"),

    _p("armaf_cdn",                 "Armaf", "Club de Nuit",
       r"\bclub\s+de\s+nuit\b"),

    # ── Penhaligon's ──────────────────────────────────────────────────────────
    _p("penhaligons_halfeti",       "Penhaligon's", "Halfeti",
       r"\bhalfeti\b"),

    _p("penhaligons_iris_prima",    "Penhaligon's", "Iris Prima",
       r"\biris\s+prima\b"),

    # ── Jo Malone ─────────────────────────────────────────────────────────────
    _p("jm_wood_sage",              "Jo Malone", "Wood Sage & Sea Salt",
       r"\bwood\s+sage\b"),

    _p("jm_lime_basil",             "Jo Malone", "Lime Basil & Mandarin",
       r"\blime\s+basil\b"),

    _p("jm_peony_blush",            "Jo Malone", "Peony & Blush Suede",
       r"\bpeony\s+.{0,10}blush\b"),

    _p("jm_generic",                "Jo Malone", "Jo Malone",
       r"\bjo\s+malone\b"),

    # ── Davidoff ──────────────────────────────────────────────────────────────
    _p("davidoff_cool_water",       "Davidoff", "Cool Water",
       r"\bcool\s+water\b.*\bdavidoff\b|\bdavidoff\b.*\bcool\s+water\b"),

    _p("davidoff_zino",             "Davidoff", "Zino",
       r"\bdavidoff\b.*\bzino\b|\bzino\b.*\bdavidoff\b"),

    # ── Montblanc ─────────────────────────────────────────────────────────────
    _p("montblanc_legend",          "Montblanc", "Legend",
       r"\bmontblanc\b.*\blegend\b|\blegend\b.*\bmontblanc\b"),

    _p("montblanc_explorer",        "Montblanc", "Explorer",
       r"\bmontblanc\b.*\bexplorer\b|\bexplorer\b.*\bmontblanc\b"),

    # ── Cacharel ──────────────────────────────────────────────────────────────
    _p("cacharel_amor_amor",        "Cacharel", "Amor Amor",
       r"\bamor\s+amor\b"),

    _p("cacharel_anais_anais",      "Cacharel", "Anaïs Anaïs",
       r"\banai[s]?\s+anai[s]?\b"),

]
# fmt: on

PRODUCT_LUT: list[LUTEntry] = _RAW
PERFUME_LUT: list[PerfumeLUTEntry] = _PERFUME_RAW


def lookup(title_normalised: str) -> LUTEntry | None:
    """Return the first matching LUTEntry for a normalised title, or None."""
    for entry in PRODUCT_LUT:
        if entry.pattern.search(title_normalised):
            return entry
    return None


def lookup_perfume(title_normalised: str) -> PerfumeLUTEntry | None:
    """Return the first matching PerfumeLUTEntry for a normalised title, or None."""
    for entry in PERFUME_LUT:
        if entry.pattern.search(title_normalised):
            return entry
    return None
