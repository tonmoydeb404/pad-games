import type { AnimalCall } from "./types";

/** What each species says (the "horn"), and how it is written on screen. */
export const CALLS: Record<string, { kind: AnimalCall; text: string }> = {
  Deer: { kind: "bleat", text: "Bleat!" },
  Stag: { kind: "bellow", text: "Bellow!" },
  Fox: { kind: "yip", text: "Yip yip!" },
  Wolf: { kind: "howl", text: "Awoooo!" },
  Husky: { kind: "bark", text: "Woof woof!" },
  ShibaInu: { kind: "bark", text: "Woof!" },
  Horse: { kind: "neigh", text: "Neigh!" },
  Horse_White: { kind: "neigh", text: "Neigh!" },
  Donkey: { kind: "bray", text: "Hee-haw!" },
  Alpaca: { kind: "hum", text: "Hmmm~" },
  Cow: { kind: "moo", text: "Moooo!" },
  Bull: { kind: "bellow", text: "BELLOW!" },
  Frog: { kind: "croak", text: "Ribbit!" },
  Snake: { kind: "hiss", text: "Hissss!" },
  Snake_angry: { kind: "hiss", text: "HISSSS!" },
  Rat: { kind: "squeak", text: "Squeak!" },
  Spider: { kind: "chitter", text: "Skrrrt!" },
  Trex: { kind: "roar", text: "ROOOAAR!" },
  Velociraptor: { kind: "screech", text: "SKREEE!" },
  Triceratops: { kind: "grunt", text: "Hwonk!" },
  Stegosaurus: { kind: "grunt", text: "Rrrmph!" },
  Apatosaurus: { kind: "trumpet", text: "Brooom!" },
  Parasaurolophus: { kind: "honk", text: "Hoooonk!" },
  Wasp: { kind: "buzz", text: "Bzzzzz!" },
};
