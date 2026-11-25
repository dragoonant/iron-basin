// Combat v2 (docs/spec/15-combat-v2.md). Each id is pending (it.todo) until its slice lands, then a real test.
// tests/coverage.test.ts checks that every spec 15 id appears here.
import { describe, it } from 'vitest';

describe('drive (slice 5b)', () => {
  it.todo('DRV-1 When a side’s phase starts, each of its standing walkers gets drive = its body’s');
  it.todo('DRV-2 In its side’s phase a walker gives orders in any order, each paying its DP cost');
  it.todo('DRV-3 Walk costs drive.walk');
  it.todo('DRV-4 Fire costs its mode’s dp');
  it.todo('DRV-5 Stand down ends the walker’s orders for the phase');
  it.todo('DRV-6 Reserve');
  it.todo('DRV-7 Overweight no longer reduces move');
  it.todo('DRV-8 Undo takes back a walker’s last walk, refunding its DP and its facing, while all');
  it.todo('DRV-9 legalActions lists every walk, fire, maneuver, undo and stand down the walker ca');
});
describe('to hit and damage (slice 5b)', () => {
  it.todo('HIT-1 A roll’s chance = base accuracy + arm accuracy + pilot skill + modifiers, clampe');
  it.todo('HIT-2 Modifiers: +heightBonus from higher ground');
  it.todo('HIT-3 A hit lands on a part drawn from the class weights, changed by the arc');
  it.todo('HIT-4 Damage per hit = × a factor in dmgSpread, rounded');
});
describe('fire modes (slice 5b)', () => {
  it.todo('MOD-1 A fire order names the walker, a slot, a mode of the weapon in that slot, and a');
  it.todo('MOD-2 A mode fires shots rolls');
  it.todo('MOD-3 Ammunition is per weapon');
  it.todo('MOD-4 call: true: the order names the part: body, armL, armR or legs');
  it.todo('MOD-5 needs: "still": only if the walker has not walked this phase');
  it.todo('MOD-6 effect: "pin": if at least one shot hits, the target is pinned: in its next phas');
  it.todo('MOD-7 effect: "push", "knockdown", "stagger": if at least one shot hits, the target is');
  it.todo('MOD-8 effect: "overwatch" and effect: "guard" set reactions');
  it.todo('MOD-9 Splash stays with High explosive only');
});
describe('facing (slice 5b)', () => {
  it.todo('FAC-1 A walker faces N, E, S or W. Mission data gives the start facing');
  it.todo('FAC-2 Arc of an attacker seen from a target');
  it.todo('FAC-3 Side hits double the weight of the arm on that side');
  it.todo('FAC-4 A pack hit’s damage goes to the body');
  it.todo('FAC-5 A shield in the left hand cuts damage by its guard percentage to the body and le');
  it.todo('FAC-6 The arc to-hit bonus does not apply to indirect fire, which already uses the rea');
});
describe('maneuvers (slice 5c)', () => {
  it.todo('MAN-1 A walker may use the maneuvers its parts list, the universal list, and its pilot');
  it.todo('MAN-2 Dash: a walk with move + moveBonus');
  it.todo('MAN-3 Hop: climbing costs no climbCost, and a fall does no damage and does not knock d');
  it.todo('MAN-4 Kick and Ram jab');
  it.todo('MAN-5 Brace: until the walker’s next phase it cannot be pushed or knocked down and its');
  it.todo('MAN-6 Grab: a melee roll at baseAcc, no damage');
  it.todo('MAN-7 Throw: a direct roll at baseAcc/baseDmg, range min..max');
  it.todo('MAN-8 Overdrive: +gain drive now');
  it.todo('MAN-9 Mark: a walker in sensorRange and in the walker’s own line of sight is marked un');
  it.todo('MAN-10 Patch: SUP-1 as an order: one charge restores the pack’s heal to a damaged, not');
  it.todo('MAN-11 Tow: the walker steps one tile straight away from an adjacent ally and the ally');
  it.todo('MAN-12 Shunt wagon: see FLD-3');
});
describe('reactions (slice 5d)', () => {
  it.todo('RCT-1 Reactions happen in the enemy phase, cost reserve, and never draw reactions of t');
  it.todo('RCT-2 Return fire: when a direct or melee roll against a walker ends and the walker st');
  it.todo('RCT-3 Overwatch: the lane is the straight line of tiles from the walker in the directi');
  it.todo('RCT-4 Guard: set on an adjacent ally');
  it.todo('RCT-5 Brace, Plant and Guard cost nothing more after the order');
  it.todo('RCT-6 Hold fire is a per-walker switch, off by default and changeable at no cost in th');
  it.todo('RCT-7 Several overwatchers triggered by the same tile fire nearest first, then by unit');
});
describe('the field (slice 5c)', () => {
  it.todo('FLD-1 Push: the walker moves one tile straight away from the pusher');
  it.todo('FLD-2 Knocked down: evasion 0, hits use the rear weights, no reactions');
  it.todo('FLD-3 Shunt wagon: a walker on a rail tile next to a wagon on the same rail line, alon');
  it.todo('FLD-4 Rolling wagons carry their HP; a wagon broken by a collision becomes rubble wher');
  it.todo('FLD-5 Container stacks');
  it.todo('FLD-6 Smoke: the chosen tile and every tile within smokeRadius');
  it.todo('FLD-7 Smoke, rails and stacks are in the plain-JSON state');
  it.todo('FLD-8 Pushes, falls, collisions, rolling wagons, topples and cook-offs are not attacks');
});
describe('nerve (slice 5e)', () => {
  it.todo('NRV-1 Every pilot has nerve from 0 to nerve.max, starting each battle at the pilot’s n');
  it.todo('NRV-2 Changes, applied as they happen, clamped to 0..max');
  it.todo('NRV-3 Steady at nerve.steady or more');
  it.todo('NRV-4 Maneuvers with nerve need at least that much and spend it');
  it.todo('NRV-5 Signatures, once per battle, Steady only');
  it.todo('NRV-6 Nerve and signature use are in the state, so a replay is exact');
  it.todo('NRV-7 The AI sees its own and the enemy’s nerve');
});
