import * as Data from "./phone-data.js";
import * as Store from "./store.js";
import * as Maps from "./maps.js";
import * as Time from "./time.js";
import * as FastTravel from "./fast-travel.js";

/** The Tickets app: buy fast-travel tickets for Swellow Air, the Rhyhorn Express,
 *  the Wailord Line and the Mantine Line. Runs as methods on the phone window
 *  (`this` is the RegistryPhone), same as the other paid apps. */

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

function pinName(id) {
  return Maps.pinById(id)?.name ?? id ?? "Unknown";
}

export function ticketsContext(phone) {
  const here = phone.location;
  const hereName = here ? pinName(here) : null;
  const legs = here ? FastTravel.legsFrom(here) : [];

  const byService = {};
  for (const leg of legs) {
    byService[leg.service] ??= { label: leg.label, icon: leg.icon, color: leg.color, routes: [] };
    byService[leg.service].routes.push({
      service: leg.service, legId: leg.legId, toPin: leg.toPin, toName: pinName(leg.toPin),
      baseFare: Store.fmtMoney(leg.baseFare), hoursLabel: leg.hoursLabel, note: leg.note, overnight: leg.overnight,
      departures: leg.departures.map((d) => ({
        time: d.time, dayLabel: d.dayLabel, clock: d.clock, tag: d.tag,
        fare: Store.fmtMoney(Math.round(leg.baseFare * (d.mult ?? 1))),
        cheap: (d.mult ?? 1) < 1, pricey: (d.mult ?? 1) > 1
      }))
    });
  }
  const services = Object.values(byService);

  const pending = phone.tickets.find((tk) => !tk.delivered && tk.arrival > Time.now());
  const current = pending ? {
    serviceLabel: pending.serviceLabel, fromName: pinName(pending.fromPin), toName: pinName(pending.toPin),
    departureLabel: Time.dayLabel(pending.departure) + " " + Time.timeOfDay(pending.departure),
    arrivalLabel: Time.dayLabel(pending.arrival) + " " + Time.timeOfDay(pending.arrival)
  } : null;

  const history = phone.tickets.filter((tk) => tk.delivered).slice(0, 8).map((tk) => ({
    serviceLabel: tk.serviceLabel, toName: pinName(tk.toPin), fare: Store.fmtMoney(tk.fare), when: Time.dayLabel(tk.departure)
  }));

  return {
    balance: Store.fmtMoney(Store.money(this.actor)),
    hereName, noLocation: !here, services, current, history
  };
}

export const ticketActions = {
  async apBuyTicket(event, target) {
    const { service, toPin, departure } = target.dataset;
    const phone = this.phone;
    const leg = FastTravel.findLeg(phone.location, service, toPin);
    const dep = leg?.departures.find((d) => d.time === Number(departure));
    if (!leg || !dep) return;
    const fare = Math.round(leg.baseFare * (dep.mult ?? 1));
    const { DialogV2 } = foundry.applications.api;
    const toName = pinName(toPin);
    const ok = await DialogV2.confirm({
      window: { title: "Buy ticket?" },
      content: `<p><strong>${esc(leg.label)}</strong> to <strong>${esc(toName)}</strong><br>
        Departs ${esc(dep.dayLabel)} at ${esc(dep.clock)}, ${esc(leg.hoursLabel)} ${leg.overnight ? "overnight " : ""}crossing.<br>
        Fare: <strong>${Store.fmtMoney(fare)}</strong></p>`,
      rejectClose: false
    });
    if (!ok) return;
    const res = await this.withBusy("Booking...", () => Data.ask("ticket", { actorId: this.actor.id, service, toPin, departure: dep.time }));
    if (!res?.ok) return ui.notifications.warn(res?.error ?? "Couldn't book that ticket.");
    if (res.queued) return ui.notifications.info(`Ticket to ${toName} is queued. It's booked (and paid) when the GM's next online.`);
    ui.notifications.info(`Booked! Arriving in ${toName} ${Time.dayLabel(res.arrival)} at ${Time.timeOfDay(res.arrival)}.`);
    this.render();
  }
};
