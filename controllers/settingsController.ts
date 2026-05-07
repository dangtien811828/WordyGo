import type { Request, Response } from 'express';

const settingsController = {
  getIndex(req: Request, res: Response) {
    res.render('settings/index', {
      title: 'Settings',
      active: 'settings',
    });
  },
};

export = settingsController;
