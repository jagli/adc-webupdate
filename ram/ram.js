/* Hidden feature: Ram, Lighting Designer.
   Loaded only at the link #ram (js/main.js). It replaces the page's main content with Ram's feature,
   built from the site's own sections, and keeps it out of search results. */
(function () {
  const main = document.getElementById("content");
  if (!main) return;

  document.title = "Ram — Lighting Designer — Abhinava Dance Company";
  const robots = document.createElement("meta");
  robots.name = "robots";
  robots.content = "noindex, nofollow";
  document.head.append(robots);
  document.body.dataset.page = "ram";

  const photo = (name) => `ram/photos/${name}`;
  const work = [
    ["ram-lighting-desk.jpg", "Ram at the lighting desk, setting a scene"],
    ["ram-sound-desk.jpg", "Ram at the sound desk during a technical rehearsal"],
    ["ram-dimmer-rack.jpg", "Ram checking the dimmer rack in the light booth"],
    ["ram-control-room.jpg", "Ram in the control room before the show"],
    ["ram-fixtures.jpg", "Ram carrying two stage lights backstage"],
  ];

  main.innerHTML = `
    <section class="v-hero v-hero--band" id="ram">
      <div class="v-hero__media"><img src="${photo("ram-hero.jpg")}" alt="Ram backstage, carrying two stage lights" width="2000" height="960" style="object-position: right center"></div>
      <div class="v-hero__shade"></div>
      <div class="v-hero__body layout">
        <span class="v-label">Production Team</span>
        <h1 class="v-hero__title">Ram <em>Lighting Designer</em></h1>
        <p class="v-micro">The youngest hands on the Abhinava light desk</p>
      </div>
    </section>

    <section class="s-section s-section--classic s-section--accent-gold">
      <div class="s-section__visual s-section__visual--whole ram-badges"><img src="${photo("ram-badges.jpg")}" alt="Ram wearing his name badges: Lighting Designer and Marble Track Designer"></div>
      <div class="s-section__content s-section__content--dark">
        <span class="s-section__eyebrow">Meet the Crew</span>
        <h2 class="s-section__title">Every Show Needs Its Light</h2>
        <div class="content-prose">
          <p>Before the dancers step out, someone has to bring up the light. At Abhinava Dance Company that job increasingly belongs to <strong>Ram</strong> — our self-appointed Lighting Designer, who arrives at rehearsals with his title already pinned to his shirt, several times over, just in case anyone forgets.</p>
          <p>Ram knows every fader on the desk, has opinions about the dimmer rack, and carries his own fixtures backstage. When he is not lighting the stage, he designs marble tracks — which, he will tell you, also need very good lighting.</p>
        </div>
      </div>
    </section>

    <section class="s-split-text s-section--contained" id="ram-skills">
      <div class="layout">
        <span class="s-section__eyebrow">Specialisations</span>
        <h2 class="s-section__title">What Ram Does</h2>
        <div class="s-cards s-cards--4 s-cards--titled">
          <article class="s-card"><div class="s-card__label">Main role</div><h3 class="s-card__title">Lighting Design</h3><p class="content-prose u-mt-sm u-text-sm-md">Scenes, colours and the all-important blackout. Every fader gets a fair turn.</p></article>
          <article class="s-card"><div class="s-card__label">Assisting</div><h3 class="s-card__title">Sound Desk</h3><p class="content-prose u-mt-sm u-text-sm-md">Keeps a close watch on the big mixer during technical rehearsals.</p></article>
          <article class="s-card"><div class="s-card__label">Also known for</div><h3 class="s-card__title">Marble Track Design</h3><p class="content-prose u-mt-sm u-text-sm-md">Tracks with drops, loops and tunnels, engineered with great care.</p></article>
          <article class="s-card"><div class="s-card__label">Backstage</div><h3 class="s-card__title">Equipment Crew</h3><p class="content-prose u-mt-sm u-text-sm-md">Carries two stage lights at a time, cables and all, without being asked.</p></article>
        </div>
      </div>
    </section>

    <section class="s-section s-section--classic s-section--reverse s-section--tone-alt s-section--accent-peach">
      <div class="s-section__visual s-section__visual--whole">
        <div class="s-mini s-mini--snug s-mini--upright" data-mini-carousel role="group" aria-roledescription="carousel" aria-label="Ram at work">
          <div class="s-mini__track" tabindex="0">
            ${work.map(([f, alt]) => `<img class="s-mini__slide" src="${photo(f)}" alt="${alt}" loading="lazy">`).join("\n            ")}
          </div>
        </div>
      </div>
      <div class="s-section__content s-section__content--olive">
        <span class="s-section__eyebrow">In the Booth</span>
        <h2 class="s-section__title">Behind the Desk</h2>
        <div class="content-prose">
          <p>From the studio light desk to the control room of a full auditorium, Ram has worked them all. He prefers consoles with many faders and at least one button that glows.</p>
          <p>Colleagues report that he has never once forgotten to switch the lights on.</p>
        </div>
      </div>
    </section>

    <section class="s-split-text s-section--contained" id="ram-desk">
      <div class="layout">
        <span class="s-section__eyebrow">Try It Yourself</span>
        <h2 class="s-section__title">Ram's Lighting Desk</h2>
        <div class="content-prose"><p>Move the faders to light the stage the way Ram would.</p></div>
        <div class="ram-desk u-mt-xl">
          <div class="ram-desk__stage" aria-hidden="true"><span class="ram-desk__name">Ram</span><span class="ram-desk__role">Lighting Designer</span></div>
          <div class="ram-desk__faders">
            <label>Red<input type="range" min="0" max="100" value="70" data-light="r"></label>
            <label>Amber<input type="range" min="0" max="100" value="80" data-light="a"></label>
            <label>Blue<input type="range" min="0" max="100" value="40" data-light="b"></label>
            <label>Spot<input type="range" min="0" max="100" value="90" data-light="s"></label>
          </div>
        </div>
      </div>
    </section>
  `;

  const desk = main.querySelector(".ram-desk");
  const update = () => {
    desk.querySelectorAll("input").forEach((i) => desk.style.setProperty(`--${i.dataset.light}`, i.value / 100));
  };
  desk.addEventListener("input", update);
  update();
  window.scrollTo(0, 0);
})();
