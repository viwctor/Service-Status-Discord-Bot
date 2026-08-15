import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
} from "discord.js";

const DISCORD_TOKEN =
  process.env.DISCORD_TOKEN;

const DISCORD_CHANNEL_ID =
  process.env.DISCORD_CHANNEL_ID;

const DISCORD_GUILD_ID =
  process.env.DISCORD_GUILD_ID;

const MUSICO_BOT_ID =
  process.env.MUSICO_BOT_ID;

const JOCKIE_BOT_ID =
  process.env.JOCKIE_BOT_ID;

const FUTURE_BOT_ID =
  process.env.FUTURE_BOT_ID || "";

const STATUS_MESSAGE_ID =
  process.env.STATUS_MESSAGE_ID || "";

if (
  !DISCORD_TOKEN ||
  !DISCORD_CHANNEL_ID ||
  !DISCORD_GUILD_ID ||
  !MUSICO_BOT_ID ||
  !JOCKIE_BOT_ID
) {
  console.error(
    "Missing required environment variables.",
  );

  process.exit(1);
}

const rest =
  new REST({
    version: "10",
  }).setToken(
    DISCORD_TOKEN,
  );

/**
 * Converts Discord presence into our
 * simplified status indicator.
 */
function presenceIndicator(
  status,
) {
  if (
    status === "online" ||
    status === "idle" ||
    status === "dnd"
  ) {
    return "🟢";
  }

  if (
    status === "offline"
  ) {
    return "🔴";
  }

  return "🟡";
}

/**
 * Reads the presence of a specific
 * member/bot in the server.
 */
async function getMemberStatus(
  guild,
  userId,
) {
  if (!userId) {
    return "🟡";
  }

  try {
    await guild.members.fetch(
      userId,
    );

    const presence =
      guild.presences.cache.get(
        userId,
      );

    if (!presence) {
      return "🔴";
    }

    return presenceIndicator(
      presence.status,
    );
  } catch (error) {
    console.warn(
      `Could not check Discord member ${userId}:`,
      error.message,
    );

    return "🟡";
  }
}

/**
 * Read Discord bot statuses.
 */
async function getBotStatuses() {
  const client =
    new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
      ],
    });

  try {
    await client.login(
      DISCORD_TOKEN,
    );

    /**
     * Give Discord a moment to populate
     * the initial presence cache.
     */
    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          3000,
        ),
    );

    const guild =
      client.guilds.cache.get(
        DISCORD_GUILD_ID,
      );

    if (!guild) {
      throw new Error(
        "Discord server was not found.",
      );
    }

    const musico =
      await getMemberStatus(
        guild,
        MUSICO_BOT_ID,
      );

    const jockie =
      await getMemberStatus(
        guild,
        JOCKIE_BOT_ID,
      );

    const future =
      FUTURE_BOT_ID
        ? await getMemberStatus(
            guild,
            FUTURE_BOT_ID,
          )
        : "🟡";

    return {
      musico,
      jockie,
      future,
    };
  } finally {
    client.destroy();
  }
}

/**
 * Brasília timestamp.
 */
function getBrasiliaTime() {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone:
        "America/Sao_Paulo",

      day: "2-digit",
      month: "2-digit",
      year: "numeric",

      hour: "2-digit",
      minute: "2-digit",

      hour12: false,
    },
  )
    .format(
      new Date(),
    )
    .replace(
      ",",
      " às",
    );
}

/**
 * Build the single status message.
 *
 * Service checks will be implemented
 * after the Discord presence test.
 */
function buildStatusMessage(
  botStatuses,
) {
  return [
    "# STATUS DOS SERVIÇOS",
    "",
    "### BOTS",
    "",
    `\`Musico ${botStatuses.musico}\``,
    `\`Jockie ${botStatuses.jockie}\``,
    `\`Futuro bot ${botStatuses.future}\``,
    "",
    "### SERVIÇOS",
    "",
    "`Cloudflare 🟡`",
    "`WhatsApp 🟡`",
    "`Steam 🟡`",
    "`Nubank 🟡`",
    "`Itaú 🟡`",
    "`Banco do Brasil 🟡`",
    "",
    `*Última verificação: ${getBrasiliaTime()}*`,
  ].join(
    "\n",
  );
}

/**
 * Create the message on first run,
 * or update the existing one.
 */
async function updateStatusMessage(
  content,
) {
  if (
    STATUS_MESSAGE_ID
  ) {
    await rest.patch(
      Routes.channelMessage(
        DISCORD_CHANNEL_ID,
        STATUS_MESSAGE_ID,
      ),
      {
        body: {
          content,
        },
      },
    );

    console.log(
      "Status message updated.",
    );

    return;
  }

  const message =
    await rest.post(
      Routes.channelMessages(
        DISCORD_CHANNEL_ID,
      ),
      {
        body: {
          content,
        },
      },
    );

  console.log(
    "Status message created.",
  );

  console.log(
    `STATUS_MESSAGE_ID=${message.id}`,
  );

  console.log(
    "Save this ID as a GitHub Actions variable before enabling the schedule.",
  );
}

async function run() {
  console.log(
    "Checking Discord bot statuses...",
  );

  const botStatuses =
    await getBotStatuses();

  console.log(
    "Musico:",
    botStatuses.musico,
  );

  console.log(
    "Jockie:",
    botStatuses.jockie,
  );

  console.log(
    "Future bot:",
    botStatuses.future,
  );

  const content =
    buildStatusMessage(
      botStatuses,
    );

  await updateStatusMessage(
    content,
  );

  console.log(
    "Status bot finished successfully.",
  );
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(
      "Fatal error:",
      error,
    );

    process.exit(1);
  });
