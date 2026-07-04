// Mobile navigation toggle
document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.getElementById("nav-toggle");
  var menu = document.getElementById("nav-menu");
  var iconOpen = document.getElementById("nav-icon-open");
  var iconClose = document.getElementById("nav-icon-close");

  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var isHidden = menu.classList.contains("hidden");
      menu.classList.toggle("hidden", !isHidden ? true : false);
      menu.classList.toggle("flex", isHidden);
      iconOpen.classList.toggle("hidden");
      iconClose.classList.toggle("hidden");
      toggle.setAttribute("aria-expanded", isHidden ? "true" : "false");
    });
  }

  // Header shadow on scroll
  var header = document.getElementById("site-header");
  if (header) {
    var onScroll = function () {
      if (window.scrollY > 8) {
        header.classList.add("shadow-lg");
      } else {
        header.classList.remove("shadow-lg");
      }
    };
    window.addEventListener("scroll", onScroll);
    onScroll();
  }

  // Footer year
  var yearEl = document.getElementById("current-year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // Contact form: prefill subject from ?asunto= and send via mailto
  var contactForm = document.getElementById("contact-form");
  if (contactForm) {
    var params = new URLSearchParams(window.location.search);
    var asunto = params.get("asunto");
    var subjectField = document.getElementById("field-asunto");
    if (asunto && subjectField && !subjectField.value) {
      subjectField.value = asunto;
    }

    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var nombre = document.getElementById("field-nombre").value.trim();
      var empresa = document.getElementById("field-empresa").value.trim();
      var email = document.getElementById("field-email").value.trim();
      var telefono = document.getElementById("field-telefono").value.trim();
      var asuntoVal = document.getElementById("field-asunto").value.trim() || "Consulta desde la web";
      var mensaje = document.getElementById("field-mensaje").value.trim();

      var body = [
        "Nombre: " + nombre,
        empresa ? "Empresa: " + empresa : null,
        "Email: " + email,
        telefono ? "Teléfono: " + telefono : null,
        "",
        mensaje,
      ]
        .filter(Boolean)
        .join("\n");

      var mailto =
        "mailto:info@transcalderon.com?subject=" +
        encodeURIComponent(asuntoVal) +
        "&body=" +
        encodeURIComponent(body);

      window.location.href = mailto;
    });
  }
});
