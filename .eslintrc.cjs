// .eslintrc.cjs (or equivalent)
module.exports = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "../lib/db.internal",
            message: "Do not import pool directly. Use qReq/qPublic from lib/db.",
          },
          {
            name: "../lib/db.internal.js",
            message: "Do not import pool directly. Use qReq/qPublic from lib/db.",
          },
          {
            name: "pg",
            message: "Do not use pg directly in routes/modules. Use lib/db facade (qReq/qPublic).",
          },
        ],
      },
    ],
  },
};
