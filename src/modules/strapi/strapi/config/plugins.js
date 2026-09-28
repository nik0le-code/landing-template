module.exports = () => ({
  upload: {
    config: {
      // Renditions the site uses as srcset (plus the original).
      breakpoints: { large: 1600, medium: 1000, small: 600 },
      sizeLimit: 20 * 1024 * 1024,
      security: {
        allowedTypes: ["image/*", "application/pdf"],
        deniedTypes: ["image/svg+xml"],
      },
    },
  },
});
