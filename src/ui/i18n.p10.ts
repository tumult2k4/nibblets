/** Phase 10 strings: the rival clans beyond the map (§16, P10.1), their place in the Village panel and the feed.
 * Merged by i18n.ts. */
export const EN10 = {
  'clans.title': 'Clans beyond the hills', 'clans.none': 'No other goblins have been seen yet.', 'clans.more': 'There may be more goblins beyond the hills.',
  'clan.title': 'The {name} clan', 'clan.row': '{pop} goblins of {stock} stock, {from}', 'clan.relation': '{stance} ({n})', 'clan.traits': 'Known as {list}',
  'clan.from.n': 'from the north', 'clan.from.e': 'from the east', 'clan.from.s': 'from the south', 'clan.from.w': 'from the west',
  'clan.at.n': 'to the north', 'clan.at.e': 'to the east', 'clan.at.s': 'to the south', 'clan.at.w': 'to the west',
  'stock.moss': 'Moss', 'stock.ember': 'Ember', 'stock.tide': 'Tide', 'stock.plum': 'Plum', 'stock.mixed': 'mixed',
  'stance.allied': 'Allies', 'stance.friendly': 'Friendly', 'stance.neutral': 'Neutral', 'stance.wary': 'Wary', 'stance.hostile': 'Hostile',
  'rtrait.traders': 'traders', 'rtrait.warlike': 'fighters', 'rtrait.farmers': 'farmers', 'rtrait.pious': 'pious', 'rtrait.wanderers': 'wanderers', 'rtrait.crafty': 'tricksters',
  'clan.food.hungry': 'hungry', 'clan.food.lean': 'getting by', 'clan.food.fed': 'well fed',
  'cnews.contact': 'Met on day {day}.', 'cnews.raided': 'Raided the {other} clan on day {day}.', 'cnews.was_raided': 'Raided by the {other} clan on day {day}.',
  'cnews.allied': 'Became your allies on day {day}.', 'cnews.ally_lost': 'Left the alliance on day {day}.', 'cnews.moved': 'Relation {delta} on day {day}.',
  'ev.clan_contact': 'Strangers! Goblins of the {clan} clan have been seen {at}.', 'ev.clan_raid': 'News from beyond the hills: the {a} clan raided the {b} clan.',
  'ev.clan_alliance': 'The {clan} clan is now your ally!', 'ev.clan_alliance_end': 'The alliance with the {clan} clan is over.',
};

export const DE10: Record<keyof typeof EN10, string> = {
  'clans.title': 'Clans hinter den Hügeln', 'clans.none': 'Noch hat niemand andere Goblins gesehen.', 'clans.more': 'Hinter den Hügeln gibt es vielleicht noch mehr Goblins.',
  'clan.title': 'Der {name}-Clan', 'clan.row': '{pop} Goblins vom Stamm {stock}, {from}', 'clan.relation': '{stance} ({n})', 'clan.traits': 'Bekannt als {list}',
  'clan.from.n': 'aus dem Norden', 'clan.from.e': 'aus dem Osten', 'clan.from.s': 'aus dem Süden', 'clan.from.w': 'aus dem Westen',
  'clan.at.n': 'im Norden', 'clan.at.e': 'im Osten', 'clan.at.s': 'im Süden', 'clan.at.w': 'im Westen',
  'stock.moss': 'Moos', 'stock.ember': 'Glut', 'stock.tide': 'Gezeiten', 'stock.plum': 'Pflaume', 'stock.mixed': 'gemischt',
  'stance.allied': 'Verbündete', 'stance.friendly': 'Freundlich', 'stance.neutral': 'Neutral', 'stance.wary': 'Misstrauisch', 'stance.hostile': 'Feindselig',
  'rtrait.traders': 'Händler', 'rtrait.warlike': 'Kämpfer', 'rtrait.farmers': 'Bauern', 'rtrait.pious': 'Fromme', 'rtrait.wanderers': 'Wanderer', 'rtrait.crafty': 'Schelme',
  'clan.food.hungry': 'hungrig', 'clan.food.lean': 'kommt zurecht', 'clan.food.fed': 'satt',
  'cnews.contact': 'Getroffen an Tag {day}.', 'cnews.raided': 'Hat an Tag {day} den {other}-Clan überfallen.', 'cnews.was_raided': 'Wurde an Tag {day} vom {other}-Clan überfallen.',
  'cnews.allied': 'Wurde an Tag {day} euer Verbündeter.', 'cnews.ally_lost': 'Hat an Tag {day} das Bündnis verlassen.', 'cnews.moved': 'Beziehung {delta} an Tag {day}.',
  'ev.clan_contact': 'Fremde! Goblins vom {clan}-Clan wurden {at} gesehen.', 'ev.clan_raid': 'Nachricht von hinter den Hügeln: Der {a}-Clan hat den {b}-Clan überfallen.',
  'ev.clan_alliance': 'Der {clan}-Clan ist jetzt euer Verbündeter!', 'ev.clan_alliance_end': 'Das Bündnis mit dem {clan}-Clan ist vorbei.',
};
