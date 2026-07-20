type EasterEggAnswer = {
  status: "answered";
  title: string;
  body: string;
  links: Array<{ label: string; href: string }>;
};

const easterEggs: Array<{
  triggers: string[];
  answer: EasterEggAnswer;
}> = [
  {
    triggers: ["who is eddie", "tell me about eddie", "who built this", "who made this"],
    answer: {
      status: "answered",
      title: "The Eddie File",
      body:
        "Eddie is the founder, field-workflow wrangler, and occasionally unreasonable enemy of unnecessary clicks. Legend says he can spot a confusing button from three rooms away and turn one casual idea into a full product lane before lunch. His real superpower, though, is building all of this around the people he loves most.",
      links: [],
    },
  },
  {
    triggers: ["what is here we go again", "tell me about here we go again", "what is the podcast", "tell me about the podcast"],
    answer: {
      status: "answered",
      title: "Here We Go Again",
      body:
        "Here We Go Again is the father-daughter podcast where two generations bravely enter the same conversation with different maps, strong opinions, and absolutely no guarantee they will leave on the topic they started with. It is family history, comedy, perspective, and lovable chaos with microphones.",
      links: [],
    },
  },
  {
    triggers: ["what is a cremote", "where is the cremote", "pass the cremote", "find the cremote"],
    answer: {
      status: "answered",
      title: "The Cremote",
      body:
        "A cremote is what less imaginative households call a remote control. The name was established by the oldest daughter, survived every attempt by the dictionary to intervene, and is now binding family law. If the cremote is missing, check the couch before opening a support case.",
      links: [],
    },
  },
  {
    triggers: ["who is apa", "what is apa", "grandpa apa", "tell me about apa"],
    answer: {
      status: "answered",
      title: "Grandpa Apa",
      body:
        "Grandpa may be the conventional title, but Apa is the family-certified edition. The oldest daughter coined it, the ruling was unanimous, and no appeal has been recognized. Some titles are assigned; the great ones are invented by grandchildren.",
      links: [],
    },
  },
  {
    triggers: ["tell me about the family", "what is the family story", "eddie's family", "eddie family"],
    answer: {
      status: "answered",
      title: "The Team Behind the Team",
      body:
        "Eddie and his wife have been together since high school in 2011—an origin story with more staying power than most software companies. They are raising two beautiful girls, preserving essential language like cremote and Apa, and proving that the best things are built with patience, humor, and family at the center.",
      links: [],
    },
  },
];

function normalize(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ");
}

export function findAskCmEasterEgg(question: string): EasterEggAnswer | null {
  const normalized = normalize(question);
  return easterEggs.find((egg) => egg.triggers.includes(normalized))?.answer ?? null;
}
