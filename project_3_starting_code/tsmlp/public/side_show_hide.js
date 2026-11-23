// Commented this out because it was the annoying newsletter pop-up thing.
jQuery(function(r){
  var e = r("body"), t = r("#sidedrawer"), n = r("#sidenav");
  (n = r("strong", n)).filter(":not(.active)").next().hide(),
  n.on("click", function() { r(this).next().slideToggle(200) }),

  // SOMETHING LIKE
  // e.toggleClass("hide-sidedrawer")
  // BUT BETTER NEEDS TO GO HERE.

  r("#appbar-sidenav-show").on("click", function(){
    var e =
    r(mui.overlay("on", { onclose: function() {
    t.removeClass("active").appendTo(document.body) } })); t.appendTo(e),
    setTimeout(function() {
      t.addClass("active")
    }, 20)
  }),

  r("#appbar-sidenav-hide").on("click", function() {
    e.toggleClass("hide-sidedrawer")
  });

  var a = r("#header"), n = r("#f-hero"), s = r(window), i = n.height(), l = !1;

  function o(){
    s.scrollTop() > i ? l || (a.addClass("active"), l = !0) : l &&
    (a.removeClass("active"), l = !1) } n.length ? (s.on("scroll", o), o()) :
    0 < s.scrollTop() ? a.addClass("header-shadow") : s.one("scroll",
    function() { a.addClass("header-shadow") }), setTimeout(function() { var
    e, t, n, a, s, i; try { (a = localStorage || null) && (e =
    "_localStorageCheck", t = new Date, a.setItem(e, t), n = a.getItem(e) ==
    t, a.removeItem(e), n || (a = null)) } catch (e) { a = null } null !== a
    && null === a.getItem("newsletter-banner-close-ts")
    && (
      s = !1,

      (i = r('<div id="newsletter-banner" class="mui--text-subhead mui--z2"><div id="newsletter-banner-inner">Sign up for product alerts (monthly)<form><div class="mui-textfield"><input type="email" name="email" placeholder="Email address" spellcheck="false"></div><button class="mui-btn mui-btn--primary">Subscribe</button></form></div><div id="newsletter-banner-close">&times;</div>')).appendTo("body"),

      r("#newsletter-banner-close").on("click", function(){
        i.remove(),
        a.setItem("newsletter-banner-close-ts", new Date), ga("send", "event", "newsletter-banner", "close", s)
      }),

      r("form", i).on("submit", function(e){
        e.preventDefault();
        var t, e = r(this),
        n = r('input[name="email"]', e).val();
        n.length && (
          s = !0,
          (t = r('<div id="newsletter-banner-social"/>')).append('<a href="https://github.com/muicss/mui" target="_blank"><i class="icon-github"></i></a>'),
          t.append('<a href="https://twitter.com/mui_css" target="_blank"><i class="icon-twitter"></i></a>'),
          r.post("/newsletter",
            e.serialize()).done(function(){
              r("#newsletter-banner-inner").text("Thanks! You can follow us on Github and Twitter too!").append(t), a.setItem("newsletter-status", "success")
            })
            .fail(function(){
              r("#newsletter-banner-inner").text("Sorry, there was a problem processing your request. Please try again later.").append(t),
              a.setItem("newsletter-status", "fail")
            })
            .always(function(){
              a.setItem("newsletter-banner-close-ts", new Date)
            }),
            ga("send", "event", "newsletter-banner", "submit", n)
        )
      }),
      ga("send", "event", "newsletter-banner", "render")
    )
  }, 3e4)
})
