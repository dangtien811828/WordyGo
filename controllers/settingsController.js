module.exports = {
  getIndex(req, res) {
    res.render('settings/index', {
      title: 'Cài đặt',
      active: 'settings',
    });
  },
};
