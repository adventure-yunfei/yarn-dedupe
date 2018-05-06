# yarn-dedupe
Tools to dedupe yarn.lock

# Usage

- `$ npm install yarn-dedupe -g`
- `$ yarn-dedupe yarn.lock`

# Why?

Try this:

```
$ yarn init .
$ yarn add fs-extra@6.0.0
$ yarn add graceful-fs@4.1.6
```

Now check the `graceful-fs` package in `yarn.lock`:

```yaml
// yarn.lock
graceful-fs@4.1.6:
  version "4.1.6"
  resolved "https://registry.yarnpkg.com/graceful-fs/-/graceful-fs-4.1.6.tgz#514c38772b31bee2e08bedc21a0aeb3abf54c19e"

graceful-fs@^4.1.2, graceful-fs@^4.1.6:
  version "4.1.11"
  resolved "https://registry.yarnpkg.com/graceful-fs/-/graceful-fs-4.1.11.tgz#0e8bdfe4d1ddb8854d64e04ea7c00e2a026e5658"
```

Why? There're multiple versions of `graceful-fs`, while the version `graceful-fs@4.1.6` can safisfy all sem-versions?

# So what?

If you're creating a React app, when you happily install packages with yarn, you'll get multiple versions of React package sometime, and your app crashes. (Because multiple React instances don't work together.)

And there're so many packages that only work if there's only one version of them.

# So what this tool does?

Continue with previous duplicate `graceful-fs` example:

```
$ npm install yarn-dedupe -g
$ yarn-dedupe yarn.lock
# read yarn.lock...
# Dedupe result:
 - Resolved: graceful-fs
```

Now check `yarn.lock`:

```
graceful-fs@4.1.6, graceful-fs@^4.1.2, graceful-fs@^4.1.6:
  version "4.1.6"
  resolved "https://registry.yarnpkg.com/graceful-fs/-/graceful-fs-4.1.6.tgz#514c38772b31bee2e08bedc21a0aeb3abf54c19e"
```

Perfect! We have only one `graceful-fs` package now!

# Conclusion

`yarn` provides locked versions of packages. That's why it won't update existing versions while installing new dependecy. But that may not be what we want.

So this tool is a complementary of `yarn` lock to manually merge different versions.

