import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
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
 * Generic HTTP check with timeout.
 */
async function checkHttp(
  url,
  timeoutMs = 8000,
) {
  try {
    const response =
      await fetch(
        url,
        {
          signal:
            AbortSignal.timeout(
              timeoutMs,
            ),

          redirect:
            "follow",
        },
      );

    return response.ok;
  } catch (error) {
    console.warn(
      `HTTP check failed for ${url}:`,
      error.message,
    );

    return false;
  }
}

/**
 * Cloudflare official status.
 */
async function checkCloudflare() {
  try {
    const response =
  await fetch(
    "https://www.cloudflarestatus.com/api/v2/summary.json",
    {
      signal:
        AbortSignal.timeout(
          8000,
        ),
    },
  );

    if (!response.ok) {
      return "🟡";
    }

    const data =
      await response.json();

    const indicator =
      data?.status?.indicator;

    if (
      indicator === "none"
    ) {
      return "🟢";
    }

    if (
      indicator === "minor" ||
      indicator === "maintenance"
    ) {
      return "🟡";
    }

    if (
      indicator === "major" ||
      indicator === "critical"
    ) {
      return "🔴";
    }

    return "🟡";
  } catch (error) {
    console.warn(
      "Cloudflare status check failed:",
      error.message,
    );

    return "🟡";
  }
}

/**
 * Steam status.
 *
 * We verify three independent Steam services:
 * Store, Community and the official Web API.
 */
async function checkSteam() {
  const checks =
    await Promise.all([
      checkHttp(
        "https://store.steampowered.com/",
      ),

      checkHttp(
        "https://steamcommunity.com/",
      ),

      checkHttp(
        "https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/",
      ),
    ]);

  const online =
    checks.filter(
      Boolean,
    ).length;

  console.log(
    `Steam checks: ${online}/3 online`,
  );

  if (
    online === 3
  ) {
    return "🟢";
  }

  if (
    online === 2
  ) {
    return "🟡";
  }

  return "🔴";
}

/**
 * WhatsApp status.
 *
 * Uses Meta's official WhatsApp Business
 * Platform status page plus WhatsApp Web
 * as an additional availability signal.
 */
async function checkWhatsApp() {
  let metaStatus =
    "unknown";

  try {
    const response =
  await fetch(
    "https://metastatus.com/whatsapp-business-api",
    {
      signal:
        AbortSignal.timeout(
          8000,
        ),

      headers: {
        "User-Agent":
          "Mozilla/5.0 Service-Status-Discord-Bot",
      },
    },
  );

    if (response.ok) {
      const text =
        (
          await response.text()
        ).toLowerCase();

      if (
  text.includes(
    "the service is up and running with no known issues",
  )
) {
  metaStatus =
    "operational";
} else {
  metaStatus =
    "unknown";
}
    }
  } catch (error) {
    console.warn(
      "Meta WhatsApp status check failed:",
      error.message,
    );
  }

  const webOnline =
    await checkHttp(
      "https://web.whatsapp.com/",
    );

  console.log(
    "WhatsApp Meta status:",
    metaStatus,
  );

  console.log(
    "WhatsApp Web:",
    webOnline
      ? "online"
      : "unavailable",
  );

  if (
    metaStatus ===
      "operational" &&
    webOnline
  ) {
    return "🟢";
  }

  if (
    metaStatus ===
      "unknown" &&
    webOnline
  ) {
    return "🟢";
  }

  if (
    webOnline
  ) {
    return "🟡";
  }

  return "🔴";
}

/**
 * Service statuses.
 */
async function getServiceStatuses() {
  const [
    cloudflare,
    steam,
    whatsapp,
  ] =
    await Promise.all([
      checkCloudflare(),
      checkSteam(),
      checkWhatsApp(),
    ]);

  return {
    cloudflare,
    steam,
    whatsapp,
  };
}

/**
 * Build the single status message.
 *
 * Service checks will be implemented
 * after the Discord presence test.
 */
function buildStatusEmbed(
  botStatuses,
  serviceStatuses,
) {
  const description = [
    "Status dos serviços:",
    `\`${serviceStatuses.cloudflare} Cloudflare\``,
    `\`${serviceStatuses.steam} Steam\``,
    "",
    "`🟡 Itaú`",
    "`🟡 Banco do Brasil`",
    "`🟡 Nubank`",
    "",
    `\`${serviceStatuses.whatsapp} WhatsApp\``,
    "",
    "BOTS:",
    `\`${botStatuses.musico} Musico\`   \`${botStatuses.jockie} Jockie\`   \`${botStatuses.future} Futuro bot\``,
    "",
    `*Última verificação: ${getBrasiliaTime()}*`,
  ].join(
    "\n",
  );

  return new EmbedBuilder()
    .setColor(
      0x45a366,
    )
    .setDescription(
      description,
    );
}
/**
 * Create the message on first run,
 * or update the existing one.
 */
async function updateStatusMessage(
  embed,
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
          content: null,
          embeds: [
            embed.toJSON(),
          ],
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
          embeds: [
            embed.toJSON(),
          ],
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

  const [
    botStatuses,
    serviceStatuses,
  ] =
    await Promise.all([
      getBotStatuses(),
      getServiceStatuses(),
    ]);

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

  console.log(
    "Cloudflare:",
    serviceStatuses.cloudflare,
  );

  console.log(
    "Steam:",
    serviceStatuses.steam,
  );

  console.log(
    "WhatsApp:",
    serviceStatuses.whatsapp,
  );

  const embed =
    buildStatusEmbed(
      botStatuses,
      serviceStatuses,
    );

  await updateStatusMessage(
    embed,
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
